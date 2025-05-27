# NHL Playoff Fantasy Hockey Stats Web App

This is a zero-cost fantasy hockey web application designed for NHL playoff pools. It allows users to create and run their own fantasy leagues, manage drafts over multiple playoff rounds, track player statistics, and view league standings. The application leverages GitHub Pages for hosting and GitHub Actions for automated data updates.

## Features

-   **User Accounts and Authentication:** Secure sign-in with Google.
-   **Multi-League Support:** Create, join, and manage multiple fantasy hockey leagues.
-   **Intuitive Interfaces:** User-friendly design for league setup, multi-round draft management (including banking picks), and viewing detailed standings and player/team statistics.
-   **Dynamic Player Stats:** Fetches and updates NHL player stats for both regular season and playoffs.
-   **Playoff-Specific Logic:**
    -   Supports drafts occurring over multiple NHL playoff rounds.
    -   "Points Before Acquiring" system ensures fair scoring for players drafted mid-playoffs.
    -   Banked pick system allows teams to save picks for future rounds.
    -   Commissioner tools for managing player/team eliminations and round progression.
-   **Automated Updates:** GitHub Actions for daily (or more frequent) updates of player stats and standings.
-   **Interactive Charts:** Visualizations for league standings and team/player performance breakdowns.
-   **Cost-Free Hosting:** Runs entirely on GitHub Pages and GitHub Actions.
-   **Improved Codebase:** Separated HTML, CSS (with a common style base), and JavaScript files for better organization and maintainability.
-   **Enhanced Security:** Firebase Realtime Database rules implemented to protect league data.
-   **Unit Tested:** Core logic, such as standings calculation, includes unit tests.

## Getting Started as a User

1.  **Sign In:** Access the main page (`index.html`) and sign in using your Google account.
2.  **Manage Leagues (`manage-leagues.html`):**
    *   **Create a League:** Navigate to the "Create League" tab, fill in the details (name, number of teams, password), and invite other managers via email if desired.
    *   **Join a League:**
        *   If you have an invitation link or a league code, go to the "Join League" tab.
        *   Enter the league code to find the league.
        *   If a password is required (and you weren't directly invited via email to that league), you'll be prompted to enter it.
    *   **View Your Leagues:** The "My Leagues" tab will list all leagues you've created or joined, along with any pending invitations.
3.  **Navigate to Your League:**
    *   From "My Leagues" on `manage-leagues.html` or the list on `index.html`, click "View League" to go to `league.html` for that league's standings, rosters, and stats.
    *   Click "Go to Draftcentre" to access `draftcentre.html` for the league's draft.
4.  **Draft Centre (`draftcentre.html`):**
    *   If the draft is active, you can draft players when it's your turn.
    *   Commissioners can start the draft, manage draft rounds (conclude current, set up next), and enable commissioner mode to draft for any team.
    *   Utilize the player search, filters, and personal draft queue.
5.  **League Page (`league.html`):**
    *   View overall league standings, individual team rosters, detailed player statistics, and team point breakdowns.
    *   Commissioners have access to controls for marking NHL teams/players as eliminated.

## Setup Instructions (For Self-Hosting Your Own Instance)

1.  **Fork this Repository:** Create your own copy of this repository on GitHub.
2.  **Configure Firebase:**
    *   Create a new project on [Firebase](https://firebase.google.com/).
    *   In your Firebase project, go to "Project settings" > "General". Under "Your apps", click the "Web" icon (`</>`) to add a web app.
    *   Copy the `firebaseConfig` object provided.
    *   Create a `firebaseConfig.js` file in the root of your repository with the copied configuration:
        ```javascript
        // public/firebaseConfig.js (or root, adjust paths in HTML if in root)
        window.firebaseConfig = {
            apiKey: "YOUR_API_KEY",
            authDomain: "YOUR_AUTH_DOMAIN",
            databaseURL: "YOUR_DATABASE_URL", // Important: Realtime Database URL
            projectId: "YOUR_PROJECT_ID",
            storageBucket: "YOUR_STORAGE_BUCKET",
            messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
            appId: "YOUR_APP_ID"
        };
        ```
        *Ensure your HTML files correctly reference this file (e.g., `<script src="firebaseConfig.js"></script>`).*
    *   **Authentication:** Enable "Google" as a Sign-in method in Firebase Authentication > "Sign-in method" tab.
    *   **Realtime Database:**
        *   Set up the Realtime Database (not Firestore).
        *   Go to the "Rules" tab and import the `database.rules.json` file from this repository.
3.  **Set GitHub Secrets:**
    *   In your forked GitHub repository, go to "Settings" > "Secrets and variables" > "Actions".
    *   Create a new repository secret named `FIREBASE_SERVICE_ACCOUNT_JSON`.
    *   The value should be the JSON content of your Firebase service account key. To get this:
        *   In Firebase console: Project settings > Service accounts.
        *   Select "Firebase Admin SDK" and generate a new private key (Node.js). This will download a JSON file.
        *   Copy the entire content of this JSON file and paste it as the value for the GitHub secret.
4.  **Enable GitHub Pages:**
    *   In your repository settings, go to "Pages".
    *   Under "Build and deployment", for "Source", select "Deploy from a branch".
    *   Select the `main` (or your primary) branch and the `/ (root)` folder. Click "Save".
    *   Your site will be deployed to `https://<your-username>.github.io/<repository-name>/`.
5.  **Enable GitHub Actions:**
    *   Go to the "Actions" tab in your repository.
    *   Enable workflows if prompted. The included workflows (`daily-update.yml`) should now run on their defined schedule or when manually dispatched.

## How It Works

### Data Flow & Collection Scripts

1.  **`scripts/update_playoff_playerlist.py`**:
    *   Fetches the latest playoff statistics for *all* NHL players directly from the NHL API.
    *   Outputs this data to `data/nhl_playoff_players.json`. This file serves as a comprehensive source of current playoff stats for display in the UI (e.g., when browsing available players in the draft centre).
2.  **`scripts/update_playerlist.py`** (Requires Firebase Admin SDK via `FIREBASE_SERVICE_ACCOUNT_JSON` secret):
    *   Reads all drafted players across all leagues from Firebase Realtime Database (`leagues/$leagueId/draftedPlayers`).
    *   For players drafted in NHL playoff rounds > 1, if their "points before acquiring" for that specific acquisition round haven't been recorded (`preAcqRound < playoffRoundDrafted`), it fetches their *current* total playoff points (using `fetch_nhl_player_stats` which hits the NHL API).
    *   It then updates the player's entry in Firebase under `leagues/$leagueId/draftedPlayers/$playerKey` with:
        *   `pointsBeforeAcquiring`: The fetched current total playoff points at that moment.
        *   `preAcqRound`: Set to the `playoffRoundDrafted` value to indicate pre-acquisition stats for that round are now recorded.
    *   Finally, it compiles a consolidated list of all unique drafted players (with their potentially updated pre-acquisition stats) from all leagues into `data/playerlist_drafted_with_pre_acq_stats.json`.
3.  **`scripts/fetch_stats.py`**:
    *   Reads `data/playerlist_drafted_with_pre_acq_stats.json` (which contains all drafted players and their pre-acquisition stats).
    *   For each player in this list, it fetches their *latest* playoff stats from the NHL API (using `fetch_player_stats` utility).
    *   It preserves the `pointsBeforeAcquiring` and `playoffRoundDrafted` fields from the input file.
    *   Outputs the combined data (original drafted info + current stats) to `data/updatedstats-<YYYYMMDD>.json`. This file is the primary source for calculating current fantasy points in the standings.
4.  **`scripts/calculate_standings.py`**:
    *   Reads the latest `data/updatedstats-<YYYYMMDD>.json` file.
    *   Calculates fantasy points for each player based on their current stats and subtracts `pointsBeforeAcquiring` if applicable (i.e., if `playoffRoundDrafted > 1` and `preAcqRound` matches `playoffRoundDrafted`).
    *   Aggregates points for each fantasy team.
    *   Outputs the final league standings to `data/current-standings.json`. This file is then read by `league.html` to display standings.

### Playoff Draft System & Logic

-   **Initial Draft:** Leagues start with an initial draft (typically for NHL Playoff Round 1). Players drafted here have `playoffRoundDrafted: 1`.
-   **Subsequent Rounds:** As actual NHL playoff rounds progress, commissioners can conclude the current fantasy draft segment and initiate a new one for the next NHL round.
    -   Commissioners manage the draft order for these new segments, which can include standard picks and picks previously "banked" by teams.
-   **Banked Picks:**
    -   Teams can choose to "bank" a pick during a draft segment (only in NHL Playoff Rounds 2+).
    -   This records a placeholder `isBankedPick: true` in `draftedPlayers` and increments a counter for the team under `leagues/$leagueId/playoffRound/bankedPicks`.
    -   When setting up the next round's draft order, the commissioner can drag these banked picks into the sequence. Using a banked pick consumes it (decrements the counter).
-   **Player Elimination:** Commissioners can mark players or entire NHL teams as eliminated via `league.html`. Eliminated players cannot be drafted and (optionally, based on league rules not strictly enforced by code yet) may not contribute further points.
-   **`playoffRoundDrafted` vs. `draftStatus.round`**:
    -   `playoffRoundDrafted`: Stored on each player record in `draftedPlayers`. It indicates the *NHL Playoff Round* (1-4) during which the player was acquired by their current fantasy team. Crucial for `pointsBeforeAcquiring` logic.
    -   `draftStatus.round`: Tracks the current *internal draft round* or pass (e.g., 1st round, 2nd round of a snake draft) *within a specific draft segment* (which itself corresponds to an NHL Playoff Round). This resets when a new NHL Playoff Round's draft segment begins.

### Scoring System

The default scoring rules are:
-   Goal: 1 point
-   Assist: 1 point
-   Goalie Win: 2 points
-   Goalie Shutout: 1 point
-   **Points Before Acquiring:** For players drafted after the initial NHL playoff round (i.e., `playoffRoundDrafted > 1`), any points they scored *before* being acquired by their current fantasy team in that specific NHL playoff round are subtracted from their current playoff total to get their effective fantasy points for that team.

## Customization

-   **UI Design:** Modify HTML structure and CSS rules in `common-styles.css` and page-specific CSS files (`index.css`, `league.css`, `manage-leagues.css`, `draftcentre.css`).
-   **Scoring Rules:** Adjust the point calculation logic in `scripts/calculate_standings.py`.
-   **NHL Teams List:** The `nhlTeams` object in `league.js` and `draftcentre.js` can be updated if team names or abbreviations change.
-   **Site Content:** Edit text and layout in the HTML files.

## File Structure

```
/
├── .github/workflows/
│   └── daily-update.yml            # GitHub Action for all data updates
├── data/
│   ├── current-standings.json      # Output of calculate_standings.py, used by league.html
│   ├── nhl_players.json            # Base list of all NHL players (regular season focus)
│   ├── nhl_playoff_players.json    # List of all NHL players with current playoff stats
│   └── playerlist_drafted_with_pre_acq_stats.json # Output of update_playerlist.py, input for fetch_stats.py
│   └── updatedstats-YYYYMMDD.json  # Daily output of fetch_stats.py, input for calculate_standings.py
├── scripts/
│   ├── calculate_standings.py
│   ├── check_active_games.py       # (Note: This script's utility might be reduced if live updates are minimal)
│   ├── fetch_stats.py
│   ├── get_all_players.py          # Generates nhl_players.json
│   ├── update_playerlist.py        # Updates Firebase with pre-acq stats, generates playerlist_drafted_with_pre_acq_stats.json
│   └── update_playoff_playerlist.py # Generates nhl_playoff_players.json
│   └── tests/
│       ├── __init__.py
│       └── test_calculate_standings.py # Unit tests for standings calculation
├── common-styles.css               # Shared CSS rules for all pages
├── index.html                      # Main landing page, lists user's leagues
├── index.css                       # Styles specific to index.html
├── league.html                     # Displays league standings, rosters, player stats
├── league.js                       # JavaScript for league.html
├── league.css                      # Styles specific to league.html
├── draftcentre.html                # Interface for live drafting
├── draftcentre.js                  # JavaScript for draftcentre.html
├── draftcentre.css                 # Styles specific to draftcentre.html
├── manage-leagues.html             # Interface for creating, joining, and listing user's leagues
├── manage-leagues.js               # JavaScript for manage-leagues.html
├── manage-leagues.css              # Styles specific to manage-leagues.html
├── firebaseConfig.js               # Holds Firebase project configuration (user-generated)
├── gmailConfig.js                  # Holds Gmail API client ID & API Key (user-generated, for email invites)
├── database.rules.json             # Firebase Realtime Database security rules
├── firebase.json                   # Firebase deployment configuration (points to database.rules.json)
└── README.md
```

## Troubleshooting

-   **Data Not Updating?** Check the GitHub Actions logs in your repository ("Actions" tab) for any errors in the `daily-update` workflow.
-   **Authentication Issues?** Ensure your `firebaseConfig.js` is correct and Google Sign-In is enabled in your Firebase project. Also, check that the authorized domains for OAuth include your GitHub Pages URL.
-   **Force Update:** Manually trigger the `Daily Stats Update` workflow from the "Actions" tab in your GitHub repository.
-   **Incorrect Pre-Acquisition Stats?** Ensure the `FIREBASE_SERVICE_ACCOUNT_JSON` secret is correctly set up for `scripts/update_playerlist.py` to run.

## Credits

-   NHL Stats API for player and game data.
-   Chart.js for data visualizations.
-   Firebase for authentication and Realtime Database.
-   GitHub Pages and GitHub Actions for hosting and automation.

## Disclaimer

© 2025 Rink Rivals. All rights reserved.
This code is provided for viewing purposes only. No permission is granted for use, 
modification, or distribution without explicit written consent from the owner.