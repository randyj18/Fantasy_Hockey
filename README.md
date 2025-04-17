# NHL Playoff Fantasy Hockey Stats Web App

A zero-cost fantasy hockey tracker that uses GitHub Pages for hosting and GitHub Actions for automated data updates. This web app allows you to track NHL player stats, calculate fantasy points, and display team standings without any hosting costs.

## Features

- 📊 Real-time standings and player statistics
- 🏒 Player selection interface for managing your league
- 📱 Mobile-friendly design
- 🔄 Automatic daily updates via GitHub Actions
- ⚡ Live updates during games (when your players are playing)
- 📉 Interactive charts and visualizations
- 💰 Zero hosting or maintenance costs

## Playoff Draft Features

- **Multiple Round Drafts**: Support for subsequent drafts as playoff rounds progress
- **Bank Pick System**: Teams can skip current picks to bank them for future rounds
- **Elimination Tracking**: Visualizations for eliminated players and teams
- **Round Management**: Commissioners can manually conclude rounds and set draft order
- **Team Roster Management**: Track which players are active or eliminated

## Setup Instructions

### 1. Fork this Repository

Click the "Fork" button in the top-right corner of this repository to create your own copy.

### 2. Enable GitHub Pages

1. Go to your repository settings
2. Navigate to "Pages" in the sidebar
3. Under "Source", select "main" branch
4. Click "Save"
5. Wait for GitHub to deploy your site (URL will be provided)

### 3. Configure Your Fantasy League

1. Go to `player-selection.html` on your deployed site
2. Use the interface to search for NHL players
3. Assign players to teams in your fantasy league
4. Click "Save to GitHub" (or download and manually add to your repository)

### 4. Enable GitHub Actions

1. Go to the "Actions" tab in your repository
2. Click "Enable Actions"
3. The automated workflows will now run according to schedule:
   - Daily update at 8:00 UTC
   - Game day checks every 3 hours

## How It Works

### Data Collection

1. `fetch_stats.py` retrieves player statistics from the NHL API
2. `calculate_standings.py` processes the data and calculates fantasy points
3. `update_playerlist.py` tracks player acquisition timing to calculate pre-acquisition stats
4. Results are stored as JSON files in the `data/` directory

### Playoff Draft System

1. Teams complete an initial draft (playoff round 1) at the start of the playoffs
   - This is a multi-round draft (typically 7 rounds)
   - Each round in this draft has `playoffRoundDrafted = 1`
2. As NHL teams are eliminated, players become unavailable for future drafts
3. When a playoff round concludes, commissioners can:
   - Mark the round as complete
   - Set custom draft order for the next round
   - Incorporate banked picks into the draft order
4. Teams can choose to bank picks for future rounds
5. The system supports separate concepts:
   - **Playoff Round**: Tracked in `playoffRound/currentRound` (1-4)
   - **Draft Round**: Each playoff round has its own single-round draft, tracked in `draftStatus/round`
6. Players drafted in subsequent playoff rounds are tracked with `playoffRoundDrafted` (2-4)
7. Pre-acquisition points are automatically calculated for playoff-drafted players

### Scoring System

The scoring system used for this fantasy league is:
- 1 point for each goal
- 1 point for each assist
- 2 points for each goalie win
- 1 point for each shutout
- Custom points for Gordie Howe Hat Tricks and Conn Smythe awards
- Points before a player was acquired are subtracted

### Customization

You can customize the app by:
- Editing the team names in `player-selection.html`
- Modifying the scoring formula in `calculate_standings.py`
- Changing the UI design by editing the HTML/CSS

## File Structure

```
/
├── .github/workflows/
│   ├── daily-update.yml
│   ├── game-day-update.yml  (fixed version)
│   └── player-database-update.yml
├── data/
│   ├── current-standings.json
│   ├── nhl_players.json
│   └── playerlist.json
├── scripts/
│   ├── check_active_games.py
│   ├── fetch_stats.py
│   ├── calculate_standings.py
│   ├── get_all_players.py
│   └── update_playerlist.py (new script)
├── index.html
├── league.html
├── draftcentre.html
├── manage-leagues.html
└── README.md
```

## Troubleshooting

- **Missing data?** Check the GitHub Actions logs to see if there were any API errors
- **Want to force an update?** You can manually trigger the workflows from the Actions tab
- **Need to add custom stats?** Edit both the `fetch_stats.py` and `calculate_standings.py` files

## Credits

This project uses:
- NHL Stats API
- Chart.js for visualizations
- GitHub Pages and GitHub Actions

## Disclaimer

© 2025 Rink Rivals. All rights reserved.
This code is provided for viewing purposes only. No permission is granted for use, 
modification, or distribution without explicit written consent from the owner.