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
    """Fetch player stats from NHL API. This is used to get CURRENT playoff points."""
    try:
        # Updated NHL API URL
        stats_url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
        
        response = requests.get(stats_url)
        response.raise_for_status()
        data = response.json()
        
        # Only get playoff stats
        featured_stats = data.get('featuredStats', {})
        
        # Check for playoffs
        playoff_stats = featured_stats.get('playoffs', {}).get('subSeason', {})
        if playoff_stats and playoff_stats.get('gamesPlayed', 0) > 0:
            # Calculate points based on player type
            position_code = data.get('position', {}).get('code', '')
            
            if position_code == 'G':  # Goalie
                wins = playoff_stats.get('wins', 0)
                shutouts = playoff_stats.get('shutouts', 0)
                points = (wins * 2) + shutouts
            else:  # Skater
                goals = playoff_stats.get('goals', 0)
                assists = playoff_stats.get('assists', 0)
                points = goals + assists
            
            logger.info(f"Fetched playoff stats for player {player_id}: {points} points")
            return points
        else:
            logger.warning(f"No playoff stats found for player ID {player_id}")
            return 0
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching NHL API data for player {player_id}: {e}")
        return 0  # Return 0 as default when API is unreachable
    except Exception as e:
        logger.error(f"Unexpected error processing player {player_id}: {e}")
        return 0  # Return 0 as default

def process_drafted_players(database):
    """
    Processes all drafted players from Firebase.
    If a player was drafted in an NHL playoff round > 1, and their stats prior to that round
    haven't been recorded yet, it fetches their current playoff stats and updates
    `pointsBeforeAcquiring` and `preAcqRound` in Firebase.
    It then writes a JSON file (`data/playerlist_drafted_with_pre_acq_stats.json`) 
    containing all drafted players with these potentially updated stats.
    """
    try:
        # Get all leagues
        leagues_snapshot = database.child('leagues').get()
        if not leagues_snapshot:
            logger.warning("No leagues found in database")
            return 0, 0
        
        logger.info(f"Found leagues: {list(leagues_snapshot.keys() if isinstance(leagues_snapshot, dict) else [])[:5]}")
        
        # Prepare output data - this will be a dictionary of players, keyed by NHL player ID.
        # It will contain all drafted players from all leagues, ensuring each player appears once
        # with their latest pre-acquisition stats if applicable.
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
            
            if not isinstance(league_data, dict):
                logger.info(f"League data for {league_id} is not a dictionary: {type(league_data)}")
                continue
            
            if 'draftedPlayers' not in league_data:
                logger.info(f"No draftedPlayers found in league {league_id}")
                continue
                
            drafted_players_in_league = league_data['draftedPlayers']
            if not isinstance(drafted_players_in_league, dict):
                logger.info(f"draftedPlayers in league {league_id} is not a dictionary: {type(drafted_players_in_league)}")
                continue
            
            # Process all players in this league
            for firebase_player_key, player_data in drafted_players_in_league.items():
                player_entries_count += 1
                
                if not isinstance(player_data, dict):
                    logger.info(f"Player data for {firebase_player_key} is not a dictionary: {type(player_data)}")
                    continue
                
                nhl_player_id = player_data.get("playerId")
                if not nhl_player_id:
                    logger.info(f"No playerId found in player {firebase_player_key}")
                    continue
                    
                player_with_id_count += 1
                
                # Get playoff round drafted (default to 0 if not set)
                # playoffRoundDrafted is the NHL playoff round (1-4) in which the player was acquired by this team.
                playoff_round_drafted = player_data.get('playoffRoundDrafted', 0)
                # preAcqRound stores the NHL playoff round *for which* the pointsBeforeAcquiring were last calculated.
                # This helps avoid re-calculating if the script runs multiple times for the same round.
                pre_acq_round = player_data.get('preAcqRound', 0)
                
                logger.info(f"Found player {nhl_player_id} (Firebase key: {firebase_player_key}): Round drafted: {playoff_round_drafted}, PreAcqRound: {pre_acq_round}")
                
                # Update the master output_data. If a player is in multiple leagues,
                # this ensures we have their latest pre-acquisition stats if they were updated.
                if nhl_player_id not in output_data:
                    output_data[nhl_player_id] = player_data.copy() # Use a copy
                else: # Player might be in multiple leagues; ensure we have the most up-to-date preAcq info
                    if player_data.get('preAcqRound', 0) > output_data[nhl_player_id].get('preAcqRound', 0):
                        output_data[nhl_player_id]['pointsBeforeAcquiring'] = player_data.get('pointsBeforeAcquiring')
                        output_data[nhl_player_id]['preAcqRound'] = player_data.get('preAcqRound')

                # Logic to determine if pre-acquisition stats need to be fetched and updated:
                # - Player must have been drafted in an NHL playoff round greater than 1.
                # - The preAcqRound recorded for the player must be less than the round they were drafted in.
                #   This means their pre-acquisition stats for *this specific* playoffRoundDrafted haven't been captured yet.
                if playoff_round_drafted > 1 and pre_acq_round < playoff_round_drafted:
                    logger.info(f"Processing player {nhl_player_id}: drafted in NHL round {playoff_round_drafted}, preAcqRound currently {pre_acq_round}. Needs update.")
                    
                    # Fetch current playoff stats from NHL API. These become the "points before acquiring" for this round.
                    points_before_acquiring = fetch_nhl_player_stats(nhl_player_id)
                    
                    if points_before_acquiring is not None: # fetch_nhl_player_stats returns 0 on error or no stats, not None unless truly exceptional.
                        # Update player data in Realtime Database for this specific drafted player entry
                        player_ref = database.child(f"leagues/{league_id}/draftedPlayers/{firebase_player_key}")
                        
                        update_data = {
                            'pointsBeforeAcquiring': points_before_acquiring,
                            'preAcqRound': playoff_round_drafted # Mark that pre-acq stats for this round are now set
                        }
                        
                        player_ref.update(update_data)
                        logger.info(f"Updated Firebase at leagues/{league_id}/draftedPlayers/{firebase_player_key} with {update_data}")
                        
                        # Update the master output_data for this NHL player ID
                        output_data[nhl_player_id]['pointsBeforeAcquiring'] = points_before_acquiring
                        output_data[nhl_player_id]['preAcqRound'] = playoff_round_drafted
                        
                        updated_count += 1
                        logger.info(f"Updated player {nhl_player_id} with {points_before_acquiring} points before acquiring for NHL round {playoff_round_drafted}")
                else:
                    logger.info(f"Skipping update for player {nhl_player_id}: playoffRoundDrafted={playoff_round_drafted}, preAcqRound={pre_acq_round}")
                    skipped_count += 1
        
        logger.info(f"Found {league_count} leagues, {player_entries_count} player entries, {player_with_id_count} players with NHL IDs")
        
        # Ensure data directory exists
        os.makedirs('data', exist_ok=True)
        
        # Write output_data (all unique drafted players with updated pre-acq stats) to the new JSON file
        output_filename = 'data/playerlist_drafted_with_pre_acq_stats.json'
        with open(output_filename, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        logger.info(f"Process complete: Updated {updated_count} players in Firebase, skipped {skipped_count} players (already up-to-date or R1 draft).")
        logger.info(f"Saved consolidated drafted player data to {output_filename}")
        
        return updated_count, skipped_count
    
    except Exception as e:
        logger.error(f"Error processing drafted players: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return 0, 0
    
if __name__ == "__main__":
    logger.info("Starting update_playerlist.py script")
    
    # Initialize Firebase
    db_connection = initialize_firebase() # Renamed variable to avoid conflict with 'db' module
    
    # Process players
    updated_players, skipped_players = process_drafted_players(db_connection) # Pass the connection
    
    logger.info(f"Script completed: {updated_players} players updated, {skipped_players} players skipped")
