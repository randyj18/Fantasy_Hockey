#!/usr/bin/env python3
import os
import json
import firebase_admin
from firebase_admin import credentials, db
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# League ID
LEAGUE_ID = "-ONaEwjf0r2hguG0LaAu"

# Initialize Firebase
def initialize_firebase():
    """Initialize Firebase using service account credentials from environment variable"""
    firebase_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON')
    
    if not firebase_json:
        logger.error("Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_JSON environment variable.")
        exit(1)
    
    try:
        # Parse the JSON string
        service_account_info = json.loads(firebase_json)
        
        # Initialize with the parsed JSON and RTDB URL
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://playofffantasyhockey-default-rtdb.firebaseio.com'
        })
        logger.info("Firebase Realtime Database initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Error initializing Firebase: {e}")
        exit(1)

def get_drafted_players():
    """Get all drafted players for the specified league"""
    try:
        # Get the drafted players for the specific league
        # The path to drafted players is leagues/{leagueId}/draftedPlayers
        drafted_players_ref = db.reference(f'leagues/{LEAGUE_ID}/draftedPlayers')
        drafted_players = drafted_players_ref.get()
        
        if drafted_players is None:
            logger.error("No drafted players found in league")
            return 0
        
        logger.info(f"Found {len(drafted_players)} drafted players in league {LEAGUE_ID}")
        
        # Process each player
        output_data = {}
        player_count = 0
        
        for player_id, player_data in drafted_players.items():
            # Add the playerId to the data if not present
            if 'playerId' not in player_data:
                player_data['playerId'] = player_data.get('Player ID', '')
            
            # Include in output data
            output_data[player_data.get('playerId', player_id)] = player_data
            player_count += 1
            
            # Log the player info
            team = player_data.get('Team', 'Unknown Team')
            player_name = player_data.get('Player', 'Unknown Player')
            position = player_data.get('Position', 'Unknown Position')
            nhl_team = player_data.get('NHL Team', '')
            
            logger.info(f"Added player: {player_name} ({position}, {nhl_team}) - Team: {team}")
        
        # Ensure data directory exists
        os.makedirs('data', exist_ok=True)
        
        # Write output to playerlist.json
        with open('data/playerlist.json', 'w') as f:
            json.dump(output_data, f, indent=2)
        
        logger.info(f"Process complete: Saved {player_count} players to playerlist.json")
        
        return player_count
    
    except Exception as e:
        logger.error(f"Error getting drafted players: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return 0

if __name__ == "__main__":
    logger.info("Starting playerlist generation script for Realtime Database")
    
    # Initialize Firebase
    initialize_firebase()
    
    # Get and save players
    player_count = get_drafted_players()
    
    logger.info(f"Script completed: {player_count} players added to playerlist.json")