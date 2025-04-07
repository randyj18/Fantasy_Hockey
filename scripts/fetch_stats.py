import os
import requests
import json
from datetime import datetime

def fetch_player_stats(player_id):
    """Fetch player stats from NHL API"""
    stats_url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
    response = requests.get(stats_url)
    if response.status_code == 200:
        data = response.json()
        
        # Try to get playoff stats first, fall back to regular season
        featured_stats = data.get('featuredStats', {})
        
        # Check for playoffs first
        playoff_stats = featured_stats.get('playoffs', {}).get('subSeason', {})
        if playoff_stats and playoff_stats.get('gamesPlayed', 0) > 0:
            return {
                "Games Played": playoff_stats.get('gamesPlayed', 0),
                "Goals": playoff_stats.get('goals', 0),
                "Assists": playoff_stats.get('assists', 0),
                "Wins": playoff_stats.get('wins', 0),
                "Shutouts": playoff_stats.get('shutouts', 0)
            }
        
        # Fall back to regular season
        regular_stats = featured_stats.get('regularSeason', {}).get('subSeason', {})
        return {
            "Games Played": regular_stats.get('gamesPlayed', 0),
            "Goals": regular_stats.get('goals', 0),
            "Assists": regular_stats.get('assists', 0),
            "Wins": regular_stats.get('wins', 0),
            "Shutouts": regular_stats.get('shutouts', 0)
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
            player_list = json.load(file)
    except FileNotFoundError:
        print("Error: playerlist.json file not found.")
        exit(1)
    
    # Lists to collect player data by category
    players_data = []
    
    # Loop through each player and fetch player data
    for player_info in player_list:
        player_id = player_info.get('Player ID')
        
        if not player_id:
            print(f"Skipping player {player_info.get('Player', 'Unknown')} due to missing player ID.")
            continue
        
        stats = fetch_player_stats(player_id)
        
        # Convert points-related fields to integers, handling None values
        points_fields = ['Points for Gordie Howe Hattricks', 'Points for Conn Smythe', 'Points Before Acquiring']
        for field in points_fields:
            player_info[field] = int(player_info.get(field, 0) or 0)
        
        player_data = {
            "Player": player_info.get('Player'),
            "Player ID": player_id,
            "Team": player_info.get('Team'),
            **stats,
            **{field: player_info.get(field, 0) for field in points_fields}
        }
        
        players_data.append(player_data)
        print(f"Processed player: {player_info.get('Player')}")
    
    # Generate the filename with the current date
    current_date = datetime.now().strftime("%b%d")
    filename = f"updatedstats-{current_date}.json"
    
    # Path to save the file
    save_path = "data"
    
    # Write player data to JSON file
    with open(os.path.join(save_path, filename), "w") as json_file:
        json.dump(players_data, json_file, indent=4)
    
    print(f"Successfully saved stats for {len(players_data)} players to {filename}")
    
    return filename

if __name__ == "__main__":
    main()