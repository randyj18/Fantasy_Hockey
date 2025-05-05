import requests
import json
import time
import os
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import firebase_admin
from firebase_admin import credentials
from firebase_admin import db

def initialize_firebase():
    """Initialize Firebase connection"""
    try:
        # Check if already initialized
        if not firebase_admin._apps:
            # Replace with your Firebase credentials file path
            cred = credentials.Certificate("path/to/firebase/credentials.json")
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://playofffantasyhockey-default-rtdb.firebaseio.com'
            })
        return True
    except Exception as e:
        print(f"Failed to initialize Firebase: {e}")
        return False

def check_playoff_round(league_id):
    """Check if playoffs have started and what round we're in"""
    try:
        # Get the current playoff round for the specific league
        playoff_data = db.reference(f"leagues-{league_id}/playoffRound").get()
        if playoff_data and 'currentRound' in playoff_data:
            return playoff_data['currentRound']
        return 0  # Default to 0 if not found
    except Exception as e:
        print(f"Failed to fetch playoff data: {e}")
        return 0

def get_full_name(player):
    first_name = player.get('firstName', '')
    last_name = player.get('lastName', '')

    if isinstance(first_name, dict):
        first_name = first_name.get('default', '')
    if isinstance(last_name, dict):
        last_name = last_name.get('default', '')

    return f"{first_name} {last_name}".strip()

def get_position_code(player):
    """Get proper position code from player object"""
    # First try to get from the position object
    if 'position' in player and isinstance(player['position'], dict):
        if 'abbreviation' in player['position']:
            return player['position']['abbreviation']
    
    # Fall back to positionCode
    if 'positionCode' in player:
        # Map positionCode to proper abbreviation
        position_map = {
            'L': 'LW',   # Left Wing
            'R': 'RW',   # Right Wing
            'C': 'C',    # Center
            'D': 'D',    # Defense
            'G': 'G'     # Goalie
        }
        return position_map.get(player['positionCode'], player['positionCode'])
    
    return 'N/A'  # Default if no position found

def fetch_player_stats(player_id, position_code, stats_type="regularSeason", retries=3, backoff_factor=0.3):
    """Fetch player statistics - either regular season or playoffs"""
    stats_url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
    
    session = requests.Session()
    retry_strategy = Retry(
        total=retries,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS"],
        backoff_factor=backoff_factor
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    try:
        response = session.get(stats_url, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Get either regular season or playoff stats based on stats_type
        if stats_type == "playoffs":
            featured_stats = data.get('featuredStats', {}).get('playoffs', {}).get('subSeason', {})
        else:  # Default to regular season
            featured_stats = data.get('featuredStats', {}).get('regularSeason', {}).get('subSeason', {})
        
        # Base stats for all players
        player_stats = {
            'gamesPlayed': featured_stats.get('gamesPlayed', 0),
        }
        
        if position_code in ['G']:  # Goalie stats
            player_stats.update({
                'wins': featured_stats.get('wins', 0),
                'losses': featured_stats.get('losses', 0),
                'otLosses': featured_stats.get('otLosses', 0),
                'shutouts': featured_stats.get('shutouts', 0),
                'goalsAgainstAverage': featured_stats.get('goalsAgainstAverage', 0),
                'savePercentage': featured_stats.get('savePercentage', 0)
            })
        else:  # Skater stats (forwards and defensemen)
            player_stats.update({
                'goals': featured_stats.get('goals', 0),
                'assists': featured_stats.get('assists', 0),
                'points': featured_stats.get('points', 0),
                'plusMinus': featured_stats.get('plusMinus', 0),
                'pim': featured_stats.get('pim', 0),
                'powerPlayGoals': featured_stats.get('powerPlayGoals', 0),
                'powerPlayPoints': featured_stats.get('powerPlayPoints', 0),
                'gameWinningGoals': featured_stats.get('gameWinningGoals', 0)
            })
        
        return player_stats
        
    except requests.exceptions.RequestException as e:
        print(f"Failed to fetch stats for player {player_id}. Error: {e}")
        # Return minimal stats on error
        if position_code == 'G':
            return {'gamesPlayed': 0, 'wins': 0, 'shutouts': 0}
        else:
            return {'gamesPlayed': 0, 'goals': 0, 'assists': 0, 'points': 0}

def load_manual_players(file_path):
    """Load manually added players from a JSON file"""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r') as file:
                return json.load(file)
        else:
            print(f"Manual player file {file_path} not found. Continuing without manual additions.")
            return []
    except json.JSONDecodeError as e:
        print(f"Error decoding manual player file: {e}")
        return []
    except Exception as e:
        print(f"Error loading manual player file: {e}")
        return []

def get_all_players(league_id="ONaEwjf0r2hguG0LaAuc"):
    """Generate database of all NHL players - regular season or playoff stats based on current round"""
    
    # Initialize Firebase
    firebase_initialized = initialize_firebase()
    
    # Check playoff round if Firebase is initialized
    playoff_round = 0
    if firebase_initialized:
        playoff_round = check_playoff_round(league_id)
        print(f"Current playoff round: {playoff_round}")
    
    # Determine whether to fetch regular season or playoff stats
    stats_type = "playoffs" if playoff_round > 1 else "regularSeason"
    output_file = "data/nhl_playoff_players.json" if stats_type == "playoffs" else "data/nhl_players.json"
    
    print(f"Fetching {stats_type} statistics...")
    
    # Define the list of team abbreviations
    team_abbreviations = ['NJD', 'MTL', 'OTT', 'TOR', 
                         'CAR', 'FLA', 'TBL', 'WSH', 'STL', 'COL', 
                         'EDM', 'DAL', 'LAK', 'MIN', 'WPG', 
                         'VGK']

    # This is the entire list of teams. I'm removing non-playoff teams each year, but this will be preserved to be re-used each year.
    #team_abbreviations = ['NJD', 'NYI', 'NYR', 'PHI', 'PIT', 'BOS', 'BUF', 'MTL', 'OTT', 'TOR', 
    #                     'CAR', 'FLA', 'TBL', 'WSH', 'CHI', 'DET', 'NSH', 'STL', 'CGY', 'COL', 
    #                     'EDM', 'VAN', 'ANA', 'DAL', 'LAK', 'SJS', 'CBJ', 'MIN', 'WPG', 
    #                     'VGK', 'SEA', 'UTA']

    # Base URL for the API
    base_url = "https://api-web.nhle.com/v1/roster/"
    
    # Dictionary to collect all players
    all_players = []
    
    # Loop through each team and fetch player data
    for team in team_abbreviations:
        print(f"Processing team: {team}")
        url = f"{base_url}{team}/current"  # Use 'current' to get current season
        
        try:
            response = requests.get(url)
            response.raise_for_status()
            data = response.json()
            
            # Process all player categories (forwards, defensemen, goalies)
            for category in ['forwards', 'defensemen', 'goalies']:
                if category in data:
                    for player in data[category]:
                        # Get position code with proper mapping
                        position_code = get_position_code(player)
                        
                        # Get basic player info
                        player_data = {
                            "id": player['id'],
                            "fullName": get_full_name(player),
                            "firstName": player.get('firstName', {}).get('default', ''),
                            "lastName": player.get('lastName', {}).get('default', ''),
                            "positionCode": player.get('positionCode', ''),
                            "position": position_code,
                            "teamAbbreviation": team,
                            "jerseyNumber": player.get('jerseyNumber', '')
                        }
                        
                        # Add player stats (with a small delay to avoid rate limiting)
                        stats = fetch_player_stats(player['id'], position_code, stats_type)
                        player_data.update(stats)
                        
                        all_players.append(player_data)
                        time.sleep(0.1)  # Small delay between player requests
            
            # Small delay between team requests
            time.sleep(0.5)
            
        except requests.exceptions.RequestException as e:
            print(f"Failed to fetch data for team {team}. Error: {e}")
    
    # Load and add manual players
    manual_players_file = 'data/manual-playerlist.json'
    manual_players = load_manual_players(manual_players_file)
    
    if manual_players:
        # Check for duplicate players - we'll use player ID as the unique identifier
        existing_ids = {player['id'] for player in all_players}
        
        for manual_player in manual_players:
            player_id = manual_player.get('id')
            
            # Skip duplicates
            if player_id in existing_ids:
                print(f"Skipping duplicate player: {manual_player.get('fullName')} (ID: {player_id})")
                continue
            
            # Add to our list and update tracking set
            all_players.append(manual_player)
            existing_ids.add(player_id)
            
            print(f"Added manual player: {manual_player.get('fullName')} (ID: {player_id})")
    
    # Save all players to JSON file
    with open(output_file, 'w') as json_file:
        json.dump(all_players, json_file, indent=2)
    
    print(f"Successfully saved {len(all_players)} players to {output_file}")

def main():
    # Ensure data directory exists
    os.makedirs('data', exist_ok=True)
    
    # Default league ID, can be overridden by command line argument
    league_id = "ONaEwjf0r2hguG0LaAuc"
    
    # Check if a league ID was provided as a command line argument
    import sys
    if len(sys.argv) > 1:
        league_id = sys.argv[1]
    
    get_all_players(league_id)

if __name__ == "__main__":
    main()