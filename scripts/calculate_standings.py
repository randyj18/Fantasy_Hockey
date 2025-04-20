import os
import json
import glob
from datetime import datetime

def calculate_standings(stats_file_path):
    """Calculate standings based on player stats"""
    with open(stats_file_path, 'r') as file:
        players = json.load(file)
    
    # Initialize standings dictionary
    standings = {}
    
    # Process each player
    for player in players:
        # Skip if missing critical data
        if not player.get("Player ID") or not player.get("Team"):
            continue
        
        # Get team name
        team = player.get("Team")
        
        # Initialize team in standings if not already present
        if team not in standings:
            standings[team] = {
                "Total Points": 0,
                "Players": 0,
                "Goals": 0,
                "Assists": 0,
                "Wins": 0,
                "Shutouts": 0
            }
        
        # Calculate player points based on stats
        # Use 0 as default value for any missing fields
        player_points = (
            # Points from goals and assists for skaters
            player.get("Goals", 0) + 
            player.get("Assists", 0) + 
            # Points from wins and shutouts for goalies (2 points each)
            (player.get("Wins", 0) * 2) + 
            (player.get("Shutouts", 0) * 2) +
            # Special bonuses (if present)
            player.get("Points for Gordie Howe Hattricks", 0) + 
            player.get("Points for Conn Smythe", 0) +
            # Points before acquiring (for mid-season additions)
            player.get("Points Before Acquiring", 0)
        )
        
        # Update team stats
        standings[team]["Total Points"] += player_points
        standings[team]["Players"] += 1
        standings[team]["Goals"] += player.get("Goals", 0)
        standings[team]["Assists"] += player.get("Assists", 0)
        standings[team]["Wins"] += player.get("Wins", 0)
        standings[team]["Shutouts"] += player.get("Shutouts", 0)
    
    # Sort teams by total points (descending)
    sorted_standings = sorted(
        standings.items(),
        key=lambda x: x[1]["Total Points"],
        reverse=True
    )
    
    return sorted_standings

def main():
    # Create data directory if it doesn't exist
    os.makedirs('data', exist_ok=True)
    
    # Find the most recent stats file
    try:
        # First try to find updatedstats-*.json files
        stats_files = glob.glob('data/updatedstats-*.json')
        
        if stats_files:
            # Sort by modification time (most recent first)
            stats_file_path = max(stats_files, key=os.path.getmtime)
            print(f"Using most recent stats file: {stats_file_path}")
        else:
            # Fall back to playerlist.json if no updatedstats files found
            stats_file_path = 'data/playerlist.json'
            print(f"No updatedstats files found, using: {stats_file_path}")
    except Exception as e:
        print(f"Error finding stats file: {e}")
        exit(1)
    
    # Calculate standings
    standings = calculate_standings(stats_file_path)
    
    # Generate the standings file with current date
    current_date = datetime.now().strftime("%b%d")
    standings_file = f"data/standings-{current_date}.json"
    
    # Format standings for output
    formatted_standings = []
    for rank, (team_name, stats) in enumerate(standings, 1):
        formatted_standings.append({
            "Rank": rank,
            "Team": team_name,
            "Total Points": stats["Total Points"],
            "Players": stats["Players"],
            "Goals": stats["Goals"],
            "Assists": stats["Assists"],
            "Wins": stats["Wins"],
            "Shutouts": stats["Shutouts"]
        })
    
    # Save standings to JSON file
    with open(standings_file, 'w') as file:
        json.dump(formatted_standings, file, indent=4)
    
    print(f"Standings calculated and saved to {standings_file}")
    
    # Also save a copy as latest-standings.json for easy reference
    with open('data/latest-standings.json', 'w') as file:
        json.dump(formatted_standings, file, indent=4)
    
    print("Standings also saved to latest-standings.json")
    
    return standings_file

if __name__ == "__main__":
    main()