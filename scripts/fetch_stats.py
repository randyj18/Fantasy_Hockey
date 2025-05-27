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
    
    # Load player list from the specified JSON file
    input_filename = "data/playerlist_drafted_with_pre_acq_stats.json"
    try:
        with open(input_filename, "r") as file:
            player_list_data = json.load(file)
        logger.info(f"Successfully loaded player data from {input_filename}")
    except FileNotFoundError:
        logger.error(f"Error: The required input file '{input_filename}' was not found. Please run the update_playerlist.py script first.")
        exit(1)
    except json.JSONDecodeError:
        logger.error(f"Error: Could not decode JSON from '{input_filename}'. File might be corrupted or not valid JSON.")
        exit(1)
    
    # List to collect player data
    updated_players_data = []
    
    # The input is expected to be an object where keys are NHL player IDs
    if not isinstance(player_list_data, dict):
        logger.error(f"Error: Expected '{input_filename}' to contain a JSON object (dictionary), but found {type(player_list_data)}.")
        exit(1)
        
    logger.info(f"Processing {len(player_list_data)} player entries from {input_filename}.")
    
    # Loop through each player and fetch player data
    # player_list_data is a dictionary where keys are NHL player IDs
    for nhl_player_id_str, player_entry in player_list_data.items():
        if not isinstance(player_entry, dict):
            logger.warning(f"Skipping entry for key '{nhl_player_id_str}' as it's not a valid player object.")
            continue

        # The key in player_list_data is the NHL Player ID (as a string from JSON key)
        player_id_for_api = nhl_player_id_str 
        
        player_name = player_entry.get('Player', f"Player {player_id_for_api}")
        # 'Team' in playerlist_drafted_with_pre_acq_stats.json refers to the fantasy team.
        fantasy_team_name = player_entry.get('Team', 'Unknown Fantasy Team') 
        nhl_team_abbr = player_entry.get('NHL Team', 'N/A') 
        position = player_entry.get('Position', 'N/A')

        logger.info(f"Fetching current playoff stats for {player_name} (ID: {player_id_for_api})")
        current_playoff_stats = fetch_player_stats(player_id_for_api)
        
        # Preserve existing fields and add/update new stats
        # Crucially, 'pointsBeforeAcquiring' and 'preAcqRound' are preserved from the input.
        # 'playoffRoundDrafted' is also preserved as it indicates when the player was acquired.
        updated_player_data_entry = {
            "Player": player_name,
            "playerId": player_id_for_api, # Standardized field name for player's NHL ID
            "NHL Team": nhl_team_abbr,
            "Position": position,
            "FantasyTeam": fantasy_team_name, # Clarified field name
            "playoffRoundDrafted": player_entry.get('playoffRoundDrafted', 0),
            "pointsBeforeAcquiring": player_entry.get('pointsBeforeAcquiring', 0),
            "preAcqRound": player_entry.get('preAcqRound', 0),
            "currentPlayoffStats": current_playoff_stats # Fetched current playoff stats for the ongoing NHL playoff round
        }
        
        updated_players_data.append(updated_player_data_entry)
        logger.info(f"Processed player: {player_name}, Current Playoff Stats: {current_playoff_stats}")
    
    # Generate the filename with the current date
    current_date_str = datetime.now().strftime("%Y%m%d") # Using YYYYMMDD for better sorting
    filename = f"updatedstats-{current_date_str}.json"
    
    # Path to save the file
    save_path = "data"
    
    # Write player data to JSON file
    with open(os.path.join(save_path, filename), "w") as json_file:
        json.dump(players_data, json_file, indent=4)
    
    print(f"Successfully saved playoff stats for {len(players_data)} players to {filename}")
    
    return filename

if __name__ == "__main__":
    main()