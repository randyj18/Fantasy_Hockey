import os
import requests
import json
from datetime import datetime

def fetch_playoff_stats(player_id):
    """Fetch player playoff stats from NHL API"""
    stats_url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
    response = requests.get(stats_url)
    if response.status_code == 200:
        data = response.json()
        
        # Get playoff stats
        featured_stats = data.get('featuredStats', {})
        
        # Check if playoffs data exists
        if 'playoffs' not in featured_stats:
            # For players with no playoff stats, return zero values matching original field names
            # Determine if player is a goalie or skater based on position
            position_code = data.get('position', '')
            if position_code == 'G':
                return {
                    "gamesPlayed": 0,
                    "wins": 0,
                    "losses": 0,
                    "otLosses": 0,
                    "shutouts": 0,
                    "goalsAgainstAverage": 0,
                    "savePercentage": 0
                }
            else:
                return {
                    "gamesPlayed": 0,
                    "goals": 0,
                    "assists": 0,
                    "points": 0,
                    "plusMinus": 0,
                    "pim": 0,
                    "powerPlayGoals": 0,
                    "powerPlayPoints": 0,
                    "gameWinningGoals": 0
                }
        
        # Get playoff stats if they exist
        playoff_stats = featured_stats.get('playoffs', {}).get('subSeason', {})
        
        # Check if player has playoff stats
        if playoff_stats and playoff_stats.get('gamesPlayed', 0) > 0:
            # For skaters
            if 'points' in playoff_stats:
                return {
                    "gamesPlayed": playoff_stats.get('gamesPlayed', 0),
                    "goals": playoff_stats.get('goals', 0),
                    "assists": playoff_stats.get('assists', 0),
                    "points": playoff_stats.get('points', 0),
                    "plusMinus": playoff_stats.get('plusMinus', 0),
                    "pim": playoff_stats.get('pim', 0),
                    "powerPlayGoals": playoff_stats.get('powerPlayGoals', 0),
                    "powerPlayPoints": playoff_stats.get('powerPlayPoints', 0),
                    "gameWinningGoals": playoff_stats.get('gameWinningGoals', 0)
                }
            # For goalies
            else:
                return {
                    "gamesPlayed": playoff_stats.get('gamesPlayed', 0),
                    "wins": playoff_stats.get('wins', 0),
                    "losses": playoff_stats.get('losses', 0),
                    "otLosses": playoff_stats.get('otLosses', 0),
                    "shutouts": playoff_stats.get('shutouts', 0),
                    "goalsAgainstAverage": playoff_stats.get('goalsAgainstAverage', 0),
                    "savePercentage": playoff_stats.get('savePercentage', 0)
                }
        
        # If no playoff stats, return zeros matching original field names
        # Determine if player is a goalie or skater
        position_code = data.get('position', '')
        if position_code == 'G':
            return {
                "gamesPlayed": 0,
                "wins": 0,
                "losses": 0,
                "otLosses": 0,
                "shutouts": 0,
                "goalsAgainstAverage": 0,
                "savePercentage": 0
            }
        else:
            return {
                "gamesPlayed": 0,
                "goals": 0,
                "assists": 0,
                "points": 0,
                "plusMinus": 0,
                "pim": 0,
                "powerPlayGoals": 0,
                "powerPlayPoints": 0,
                "gameWinningGoals": 0
            }
    else:
        print(f"Failed to fetch stats for player {player_id}. Status code: {response.status_code}")
        # Return basic zero stats as fallback
        return {
            "gamesPlayed": 0,
            "goals": 0,
            "assists": 0,
            "points": 0
        }

def main():
    # Get the directory of the current script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Navigate up one level to Fantasy_Hockey parent directory
    parent_dir = os.path.dirname(script_dir)
    
    # Set path to data directory
    data_dir = os.path.join(parent_dir, "data")
    
    # Input and output file paths
    input_file = os.path.join(data_dir, "nhl_players.json")
    output_file = os.path.join(data_dir, "nhl_playoff_players.json")
    
    print(f"Looking for input file at: {input_file}")
    
    # Load regular season player data
    try:
        with open(input_file, "r") as file:
            players_data = json.load(file)
    except FileNotFoundError:
        print(f"Error: {input_file} not found.")
        return
    
    print(f"Loaded data from {input_file}")
    
    # Track processing statistics
    players_processed = 0
    players_with_playoff_stats = 0
    
    # Process each player
    for i, player in enumerate(players_data):
        # Get player ID
        player_id = player.get('id')
        
        if not player_id:
            player_name = player.get('fullName', f"Player {i+1}")
            print(f"Skipping player {player_name} due to missing player ID.")
            continue
        
        player_name = player.get('fullName', f"Player {player_id}")
        
        print(f"[{i+1}/{len(players_data)}] Fetching playoff stats for {player_name} (ID: {player_id})")
        
        # Fetch playoff stats
        playoff_stats = fetch_playoff_stats(player_id)
        
        # Check if player has playoff stats
        if playoff_stats.get("gamesPlayed", 0) > 0:
            players_with_playoff_stats += 1
        
        # Update player data with playoff stats (overwriting the regular season stats)
        for key, value in playoff_stats.items():
            if key in player:
                player[key] = value
        
        players_processed += 1
    
    # Save updated data with playoff stats
    with open(output_file, "w") as file:
        json.dump(players_data, file, indent=4)
    
    print(f"\nProcessing summary:")
    print(f"- Total players processed: {players_processed}")
    print(f"- Players with playoff stats: {players_with_playoff_stats}")
    print(f"- Players without playoff stats: {players_processed - players_with_playoff_stats}")
    print(f"\nSuccessfully saved playoff stats to {output_file}")

if __name__ == "__main__":
    main()