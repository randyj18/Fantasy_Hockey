import requests
import json
import os
from datetime import datetime

def main():
    """Check if there are any active NHL games with players from our fantasy teams"""
    
    # Create data directory if needed
    os.makedirs('data', exist_ok=True)

    # Get today's date in the format needed for the NHL API
    today = datetime.now().strftime('%Y-%m-%d')

    # Get the current schedule from NHL API
    try:
        response = requests.get(f'https://api-web.nhle.com/v1/schedule/{today}')
        schedule = response.json()
        
        # Check if there are any games today
        games_today = schedule.get('gameWeek', [{}])[0].get('games', [])
        
        # Check if any games are in progress
        active_games = [g for g in games_today if g.get('gameState') == 'LIVE']
        
        # Look for relevant players in active games
        with open('data/playerlist.json', 'r') as file:
            our_players = json.load(file)
        
        # Get list of teams with our players
        our_teams = set()
        for player in our_players:
            if 'NHL Team' in player:
                our_teams.add(player['NHL Team'])
        
        # Check if any of our teams are playing
        relevant_games = [g for g in active_games if 
                         g.get('homeTeam', {}).get('abbrev') in our_teams or 
                         g.get('awayTeam', {}).get('abbrev') in our_teams]
        
        # Write game status to file for reference
        with open('data/game_status.json', 'w') as f:
            json.dump({
                'games_today': len(games_today),
                'active_games': len(active_games),
                'relevant_games': len(relevant_games),
                'timestamp': datetime.now().isoformat()
            }, f, indent=2)
        
        # Set output for GitHub Actions
        if relevant_games:
            print('::set-output name=games_active::true')
            print(f'Found {len(relevant_games)} active games with our players')
            return True
        else:
            print('::set-output name=games_active::false')
            print('No active games with our players')
            return False
            
    except Exception as e:
        print(f'Error checking games: {e}')
        print('::set-output name=games_active::false')
        return False

if __name__ == "__main__":
    main()