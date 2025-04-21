import os
import requests
import json
from datetime import datetime

def fetch_player_stats(player_id):
    """Fetch player playoff stats from NHL API"""
    stats_url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
    response = requests.get(stats_url)
    if response.status_code == 200:
        data = response.json()
        
        # Only get playoff stats, don't fall back to regular season
        featured_stats = data.get('featuredStats', {})
        
        # Check for playoffs
        playoff_stats = featured_stats.get('playoffs', {}).get('subSeason', {})
        if playoff_stats and playoff_stats.get('gamesPlayed', 0) > 0:
            return {
                "Games Played": playoff_stats.get('gamesPlayed', 0),
                "Goals": playoff_stats.get('goals', 0),
                "Assists": playoff_stats.get('assists', 0),
                "Wins": playoff_stats.get('wins', 0),
                "Shutouts": playoff_stats.get('shutouts', 0)
            }
        
        # If no playoff stats, return all zeros
        return {
            "Games Played": 0,
            "Goals": 0,
            "Assists": 0,
            "Wins": 0,
            "Shutouts": 0
        }
    else:
        print(f"Failed to fetch stats for player {player_id}. Status code: {response.status_code}")
        return {
            "Games Played": 0,
            "Goals": 0,
            "Assists": 0,
            "Wins": 0,
            "Shutouts": 0
        }

def main():
    # Create data directory if it doesn't exist
    os.makedirs('data', exist_ok=True)
    
    # Load player list from JSON file
    try:
        with open("data/playerlist.json", "r") as file:
            player_list_data = json.load(file)
    except FileNotFoundError:
        print("Error: playerlist.json file not found.")
        exit(1)
    
    # Lists to collect player data by category
    players_data = []
    
    # Handle different formats of playerlist.json
    # If it's an object with keys (not an array), convert to array format for processing
    if isinstance(player_list_data, dict):
        print("Processing playerlist.json in object format")
        player_entries = []
        
        # Convert object to array of player objects with ID included
        for player_id, player_info in player_list_data.items():
            player_entry = player_info.copy()  # Create a copy to avoid modifying the original
            
            # Ensure player_id is included (could be in playerId field or we use the key)
            if 'playerId' not in player_entry:
                player_entry['playerId'] = player_id
                
            player_entries.append(player_entry)
            
        player_list = player_entries
    else:
        print("Processing playerlist.json in array format")
        player_list = player_list_data
    
    # Loop through each player and fetch player data
    for player_entry in player_list:
        # Try different field names for player ID since formats may vary
        player_id = (
            player_entry.get('playerId') or 
            player_entry.get('Player ID') or
            player_entry.get('player_id')
        )
        
        # If no player ID found, skip this player
        if not player_id:
            player_name = (
                player_entry.get('Player') or 
                player_entry.get('playerName') or
                player_entry.get('name') or
                'Unknown'
            )
            print(f"Skipping player {player_name} due to missing player ID.")
            continue
        
        # Get player name
        player_name = (
            player_entry.get('Player') or 
            player_entry.get('playerName') or 
            player_entry.get('name') or
            f"Player {player_id}"
        )
        
        # Get team name
        team_name = (
            player_entry.get('Team') or
            player_entry.get('teamName') or
            player_entry.get('NHL Team') or
            'Unknown Team'
        )
        
        print(f"Fetching playoff stats for {player_name} (ID: {player_id})")
        stats = fetch_player_stats(player_id)
        
        # Points before acquiring (if available)
        points_before_acquiring = 0
        if 'pointsBeforeAcquiring' in player_entry:
            points_before_acquiring = player_entry['pointsBeforeAcquiring']
        
        # Create player data record
        player_data = {
            "Player": player_name,
            "Player ID": player_id,
            "Team": team_name,
            "Points Before Acquiring": points_before_acquiring,
            **stats
        }
        
        players_data.append(player_data)
        print(f"Processed player: {player_name}")
    
    # Generate the filename with the current date
    current_date = datetime.now().strftime("%b%d")
    filename = f"updatedstats-{current_date}.json"
    
    # Path to save the file
    save_path = "data"
    
    # Write player data to JSON file
    with open(os.path.join(save_path, filename), "w") as json_file:
        json.dump(players_data, json_file, indent=4)
    
    print(f"Successfully saved playoff stats for {len(players_data)} players to {filename}")
    
    return filename

if __name__ == "__main__":
    main()