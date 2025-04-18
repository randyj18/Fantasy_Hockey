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
        # Get all drafted players for the league
        drafted_players_ref = db.reference(f'draftedPlayers')
        drafted_players = drafted_players_ref.get()
        
        if drafted_players is None:
            logger.error("No drafted players found")
            return 0
        
        # Filter players by league ID
        # Note: RTDB doesn't have built-in filtering, so we filter manually
        filtered_players = {}
        player_count = 0
        
        for player_id, player_data in drafted_players.items():
            # Check if player belongs to our league
            if player_data.get('leagueId') == LEAGUE_ID:
                filtered_players[player_id] = player_data
                player_count += 1
                logger.info(f"Added player {player_id}: {player_data.get('playerName', 'Unknown Player')}")
        
        logger.info(f"Found {player_count} drafted players for league {LEAGUE_ID}")
        
        # Ensure data directory exists
        os.makedirs('data', exist_ok=True)
        
        # Write output to playerlist.json
        with open('data/playerlist.json', 'w') as f:
            json.dump(filtered_players, f, indent=2)
        
        logger.info(f"Process complete: Saved {player_count} players to playerlist.json")
        
        return player_count
    
    except Exception as e:
        logger.error(f"Error getting drafted players: {e}")
        return 0

if __name__ == "__main__":
    logger.info("Starting playerlist generation script for Realtime Database")
    
    # Initialize Firebase
    initialize_firebase()
    
    # Get and save players
    player_count = get_drafted_players()
    
    logger.info(f"Script completed: {player_count} players added to playerlist.json")