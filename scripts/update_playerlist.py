#!/usr/bin/env python3
import os
import json
import requests
import firebase_admin
from firebase_admin import credentials, db
import logging
from datetime import datetime
import base64
import io
import tempfile

# Setup logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Firebase
def initialize_firebase():
    """Initialize Firebase using service account credentials from environment variables"""
    # First check if the JSON content is directly provided
    firebase_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON')
    
    if firebase_json:
        try:
            # Parse the JSON string
            service_account_info = json.loads(firebase_json)
            
            # Initialize with the parsed JSON
            cred = credentials.Certificate(service_account_info)
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://playofffantasyhockey-default-rtdb.firebaseio.com'
            })
            database = db.reference()  # Changed from db = firestore.client()
            logger.info("Firebase initialized successfully from JSON environment variable")
            return database
        except json.JSONDecodeError:
            logger.warning("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON, trying as a file path...")
        except Exception as e:
            logger.error(f"Error initializing Firebase from JSON content: {e}")
    
    # Fall back to file path method
    cred_path = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON_PATH')
    if not cred_path:
        logger.error("Firebase credentials not found. Set either FIREBASE_SERVICE_ACCOUNT_JSON (content) or FIREBASE_SERVICE_ACCOUNT_JSON_PATH (file path) environment variable.")
        exit(1)
    
    try:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://playofffantasyhockey-default-rtdb.firebaseio.com'
        })
        database = db.reference()  # Changed from db = firestore.client()
        logger.info("Firebase initialized successfully from file path")
        return database
    except Exception as e:
        logger.error(f"Error initializing Firebase from file path: {e}")
        exit(1)

def fetch_nhl_player_stats(player_id):
    """Fetch player stats from NHL API"""
    try:
        # Base URL for NHL API
        base_url = "https://statsapi.web.nhl.com/api/v1"
        
        # First get player details to determine if they're a skater or goalie
        response = requests.get(f"{base_url}/people/{player_id}")
        response.raise_for_status()
        player_data = response.json()
        
        if not player_data.get('people'):
            logger.warning(f"No data found for player ID {player_id}")
            return None
        
        player_info = player_data['people'][0]
        position = player_info.get('primaryPosition', {}).get('code')
        
        # Get playoff stats for the player
        response = requests.get(f"{base_url}/people/{player_id}/stats?stats=statsSinglePostseason")
        response.raise_for_status()
        stats_data = response.json()
        
        if not stats_data.get('stats'):
            logger.warning(f"No stats found for player ID {player_id}")
            return None
        
        stats = stats_data['stats'][0].get('splits', [])
        if not stats:
            logger.warning(f"No playoff stats found for player ID {player_id}")
            return None
        
        current_playoffs = stats[0]
        
        # Calculate points based on position
        if position == 'G':  # Goalie
            wins = current_playoffs.get('stat', {}).get('wins', 0)
            shutouts = current_playoffs.get('stat', {}).get('shutouts', 0)
            points = (wins * 2) + shutouts
        else:  # Skater
            goals = current_playoffs.get('stat', {}).get('goals', 0)
            assists = current_playoffs.get('stat', {}).get('assists', 0)
            points = goals + assists
        
        logger.info(f"Fetched playoff stats for player {player_id}: {points} points")
        return points
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching NHL API data for player {player_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error processing player {player_id}: {e}")
        return None

def process_drafted_players(database):
    """Process all drafted players and update points before acquiring"""
    try:
        # Get all leagues
        leagues_snapshot = database.child('leagues').get()  # Changed from database.get()
        if not leagues_snapshot:
            logger.warning("No leagues found in database")
            return 0, 0
        
        logger.info(f"Found leagues: {list(leagues_snapshot.keys() if isinstance(leagues_snapshot, dict) else [])[:5]}")
        
        # Prepare output data
        output_data = {}
        updated_count = 0
        skipped_count = 0
        
        league_count = 0
        player_entries_count = 0
        player_with_id_count = 0
        
        # Find and process all drafted players across all leagues
        for league_id, league_data in leagues_snapshot.items():
            league_count += 1
            logger.info(f"Processing league: {league_id}")
            
            # Check if league_data is a dict
            if not isinstance(league_data, dict):
                logger.info(f"League data for {league_id} is not a dictionary: {type(league_data)}")
                continue
            
            # Check if draftedPlayers exists in this league
            if 'draftedPlayers' not in league_data:
                logger.info(f"No draftedPlayers found in league {league_id}")
                continue
                
            drafted_players = league_data['draftedPlayers']
            if not isinstance(drafted_players, dict):
                logger.info(f"draftedPlayers in league {league_id} is not a dictionary: {type(drafted_players)}")
                continue
            
            # Process all players in this league
            for player_id, player_data in drafted_players.items():
                player_entries_count += 1
                
                if not isinstance(player_data, dict):
                    logger.info(f"Player data for {player_id} is not a dictionary: {type(player_data)}")
                    continue
                
                nhl_player_id = player_data.get("playerId")
                if not nhl_player_id:
                    logger.info(f"No playerId found in player {player_id}")
                    continue
                    
                player_with_id_count += 1
                
                # Get playoff round drafted (default to 0 if not set)
                playoff_round_drafted = player_data.get('playoffRoundDrafted', 0)
                pre_acq_round = player_data.get('preAcqRound', 0)
                
                logger.info(f"Found player {nhl_player_id}: Round drafted: {playoff_round_drafted}, PreAcqRound: {pre_acq_round}")
                
                # Store in output data using NHL player ID as key
                if nhl_player_id not in output_data:
                    output_data[nhl_player_id] = player_data
                
                # Only process players drafted in playoff rounds where preAcqRound needs updating
                if playoff_round_drafted > 1 and pre_acq_round < playoff_round_drafted:
                    logger.info(f"Processing player {nhl_player_id}: drafted in round {playoff_round_drafted}, preAcqRound {pre_acq_round}")
                    
                    # Fetch points from NHL API
                    points_before_acquiring = fetch_nhl_player_stats(nhl_player_id)
                    
                    if points_before_acquiring is not None:
                        # Update player data in Realtime Database
                        player_ref = database.child(f"leagues/{league_id}/draftedPlayers/{player_id}")
                        
                        update_data = {
                            'pointsBeforeAcquiring': points_before_acquiring,
                            'preAcqRound': playoff_round_drafted
                        }
                        
                        player_ref.update(update_data)
                        logger.info(f"Updated database at leagues/{league_id}/draftedPlayers/{player_id} with {update_data}")
                        
                        # Update output data
                        output_data[nhl_player_id]['pointsBeforeAcquiring'] = points_before_acquiring
                        output_data[nhl_player_id]['preAcqRound'] = playoff_round_drafted
                        
                        updated_count += 1
                        logger.info(f"Updated player {nhl_player_id} with {points_before_acquiring} points before acquiring")
                else:
                    logger.info(f"Skipping player {nhl_player_id}: playoffRoundDrafted={playoff_round_drafted}, preAcqRound={pre_acq_round}")
                    skipped_count += 1
        
        logger.info(f"Found {league_count} leagues, {player_entries_count} player entries, {player_with_id_count} players with IDs")
        
        # Ensure data directory exists
        os.makedirs('data', exist_ok=True)
        
        # Write output to playerlist.json
        with open('data/playerlist.json', 'w') as f:
            json.dump(output_data, f, indent=2)
        
        logger.info(f"Process complete: Updated {updated_count} players, skipped {skipped_count} players")
        logger.info(f"Saved player data to playerlist.json")
        
        return updated_count, skipped_count
    
    except Exception as e:
        logger.error(f"Error processing drafted players: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return 0, 0
    
if __name__ == "__main__":
    logger.info("Starting update_playerlist.py script")
    
    # Initialize Firebase
    db = initialize_firebase()
    
    # Process players
    updated, skipped = process_drafted_players(db)
    
    logger.info(f"Script completed: {updated} players updated, {skipped} players skipped")
