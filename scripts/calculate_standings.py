import json
import os
from collections import defaultdict
from datetime import datetime

def calculate_standings(stats_file):
    """Calculate standings from player statistics"""
    
    # Read the JSON file with updated stats
    with open(stats_file, 'r') as file:
        data = json.load(file)
    
    # Calculate points for each player and sum them up for each team
    team_points = defaultdict(int)
    player_points = defaultdict(dict)
    
    for player in data:
        team = player["Team"]
        # Calculate points based on the formula
        points = (
            player["Goals"] +
            player["Assists"] +
            player["Wins"] * 2 +
            player["Shutouts"] +
            player["Points for Gordie Howe Hattricks"] +
            player["Points for Conn Smythe"] -
            player["Points Before Acquiring"]  # Subtracting points before acquiring
        )
        team_points[team] += points
        player_points[player["Player"]] = {
            "Total Points": points,
            "Goals": player["Goals"],
            "Assists": player["Assists"],
            "Wins": player["Wins"],
            "Shutouts": player["Shutouts"],
            "Points for Gordie Howe Hattricks": player["Points for Gordie Howe Hattricks"],
            "Points for Conn Smythe": player["Points for Conn Smythe"],
            "Points Before Acquiring": player["Points Before Acquiring"]
        }
    
    # Generate the standings JSON
    standings = defaultdict(dict)
    
    for team, points in team_points.items():
        standings[team]["Total Points"] = points
        standings[team]["Players"] = {}
        for player in data:
            if player["Team"] == team:
                player_name = player["Player"]
                standings[team]["Players"][player_name] = player_points[player_name]
    
    return standings

def main():
    # Create data directory if it doesn't exist
    os.makedirs('data', exist_ok=True)
    
    # Get the current date to generate the filename
    current_date = datetime.now().strftime("%b%d")
    stats_file_path = f'data/updatedstats-{current_date}.json'
    
    # Check if stats file exists
    if not os.path.exists(stats_file_path):
        print(f"Error: Stats file not found at {stats_file_path}")
        exit(1)
    
    # Calculate standings
    standings = calculate_standings(stats_file_path)
    
    # Output the standings JSON
    output_file_path = f'data/Standings-{current_date}.json'
    with open(output_file_path, 'w') as outfile:
        json.dump(standings, outfile, indent=4)
    
    print(f"Standings saved to {output_file_path}")
    
    # Also save a copy as current-standings.json for easy reference
    current_standings_path = 'data/current-standings.json'
    with open(current_standings_path, 'w') as outfile:
        json.dump(standings, outfile, indent=4)
    
    print(f"Current standings saved to {current_standings_path}")
    
    return output_file_path

if __name__ == "__main__":
    main()