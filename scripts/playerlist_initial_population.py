#!/usr/bin/env python3
import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
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
        
        # Initialize with the parsed JSON
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        logger.info("Firebase initialized successfully")
        return db
    except Exception as e:
        logger.error(f"Error initializing Firebase: {e}")
        exit(1)

def get_drafted_players(db):
    """Get all drafted players for the specified league"""
    try:
        # Get all drafted players for the league
        players_ref = db.collection('draftedPlayers')
        
        # Query players for the specific league
        query = players_ref.where('leagueId', '==', LEAGUE_ID)
        players = query.stream()
        
        # Prepare output data
        output_data = {}
        player_count = 0
        
        for player_doc in players:
            player_id = player_doc.id
            player_data = player_doc.to_dict()
            
            # Include in output
            output_data[player_id] = player_data
            player_count += 1
            
            logger.info(f"Added player {player_id}: {player_data.get('playerName', 'Unknown Player')}")
        
        logger.info(f"Found {player_count} drafted players for league {LEAGUE_ID}")
        
        # Ensure data directory exists
        os.makedirs('data', exist_ok=True)
        
        # Write output to playerlist.json
        with open('data/playerlist.json', 'w') as f:
            json.dump(output_data, f, indent=2)
        
        logger.info(f"Process complete: Saved {player_count} players to playerlist.json")
        
        return player_count
    
    except Exception as e:
        logger.error(f"Error getting drafted players: {e}")
        return 0

if __name__ == "__main__":
    logger.info("Starting simple playerlist generation script")
    
    # Initialize Firebase
    db = initialize_firebase()
    
    # Get and save players
    player_count = get_drafted_players(db)
    
    logger.info(f"Script completed: {player_count} players added to playerlist.json")