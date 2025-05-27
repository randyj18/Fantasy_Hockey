// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get, onValue, update, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase configuration will be injected by GitHub Actions
const firebaseConfig = {
    apiKey: "PLACEHOLDER",
    authDomain: "playofffantasyhockey.firebaseapp.com",
    databaseURL: "https://playofffantasyhockey-default-rtdb.firebaseio.com",
    projectId: "playofffantasyhockey",
    storageBucket: "playofffantasyhockey.appspot.com",
    messagingSenderId: "PLACEHOLDER",
    appId: "PLACEHOLDER"
};

// Initialize Firebase
const app = initializeApp(window.firebaseConfig || firebaseConfig);
const auth = getAuth();
const provider = new GoogleAuthProvider();
const database = getDatabase();

// Global variables
let currentUser = null;
let leagueId = null; // Will be populated from URL
let leagueData = null;
let draftedPlayers = [];
let playerStats = {};
let playerStatsByID = {};
let teamRosters = {};
let teamStats = {};
let isLiveGame = false;
let chartObjects = {};
let isCommissioner = false;
let eliminatedPlayers = new Set();
let nhlTeams = {
    'ANA': 'Anaheim Ducks',
    'BOS': 'Boston Bruins',
    'BUF': 'Buffalo Sabres',
    'CGY': 'Calgary Flames',
    'CAR': 'Carolina Hurricanes',
    'CHI': 'Chicago Blackhawks',
    'COL': 'Colorado Avalanche',
    'CBJ': 'Columbus Blue Jackets',
    'DAL': 'Dallas Stars',
    'DET': 'Detroit Red Wings',
    'EDM': 'Edmonton Oilers',
    'FLA': 'Florida Panthers',
    'LAK': 'Los Angeles Kings',
    'MIN': 'Minnesota Wild',
    'MTL': 'Montreal Canadiens',
    'NSH': 'Nashville Predators',
    'NJD': 'New Jersey Devils',
    'NYI': 'New York Islanders',
    'NYR': 'New York Rangers',
    'OTT': 'Ottawa Senators',
    'PHI': 'Philadelphia Flyers',
    'PIT': 'Pittsburgh Penguins',
    'SJS': 'San Jose Sharks',
    'SEA': 'Seattle Kraken',
    'STL': 'St. Louis Blues',
    'TBL': 'Tampa Bay Lightning',
    'TOR': 'Toronto Maple Leafs',
    'VAN': 'Vancouver Canucks',
    'VGK': 'Vegas Golden Knights',
    'WSH': 'Washington Capitals',
    'WPG': 'Winnipeg Jets',
    'UTA': 'Utah Hockey Club'
};

// DOM Elements
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authStatus = document.getElementById('auth-status');
const contentContainer = document.getElementById('content-container');
const loadingMessage = document.getElementById('loading-message');
const leagueContainer = document.getElementById('league-container');
const noAccessContainer = document.getElementById('no-access-container');
const leagueNameEl = document.getElementById('league-name');
const leagueDescriptionEl = document.getElementById('league-description');
const membersListEl = document.getElementById('members-list');
const draftLinkEl = document.getElementById('draft-link');
const commissionerControlsEl = document.getElementById('commissioner-controls');

// --- Initialization: Get League ID from URL ---
function initializeLeaguePage() {
    const urlParams = new URLSearchParams(window.location.search);
    leagueId = urlParams.get('id');

    if (!leagueId) {
        loadingMessage.textContent = "No league ID provided in the URL. Please select a league from the Manage Leagues page.";
        loadingMessage.classList.remove('hidden');
        leagueContainer.classList.add('hidden');
        noAccessContainer.classList.add('hidden');
        return; // Stop further execution
    }
    console.log(`League ID from URL: ${leagueId}`);
    // Proceed with auth check, which will then call loadLeagueData if user is authenticated.
}

// --- Auth ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        authStatus.textContent = `Signed in as ${user.displayName}`;
        
        if (leagueId) { // leagueId should be set by initializeLeaguePage
            loadLeagueData();
        } else {
            // This case should ideally be caught by initializeLeaguePage, but as a fallback:
            loadingMessage.textContent = "League ID missing. Cannot load league data.";
            loadingMessage.classList.remove('hidden');
            leagueContainer.classList.add('hidden');
            noAccessContainer.classList.add('hidden');
        }
    } else {
        currentUser = null;
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        authStatus.textContent = 'You are not signed in';
        
        leagueContainer.classList.add('hidden');
        noAccessContainer.classList.add('hidden');
        commissionerControlsEl.classList.add('hidden');
        if (leagueId) {
            loadingMessage.textContent = "Please sign in to view this league.";
            loadingMessage.classList.remove('hidden');
        } else {
            loadingMessage.textContent = "No league selected and not signed in.";
            loadingMessage.classList.remove('hidden');
        }
    }
});

// Sign in with Google
loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("User signed in:", result.user);
            // onAuthStateChanged will handle UI updates and data loading
        }).catch((error) => {
            console.error("Auth error:", error);
            showNotification(`Error: ${error.message}`);
        });
});

// Sign out
logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        console.log("User signed out");
        // onAuthStateChanged will handle UI updates
    }).catch((error) => {
        console.error("Sign out error:", error);
    });
});

// --- Data Loading and Processing ---

// Load main league data
function loadLeagueData() {
    if (!currentUser) {
        loadingMessage.textContent = "Please sign in to view league data.";
        leagueContainer.classList.add('hidden');
        noAccessContainer.classList.remove('hidden'); // Or a specific "sign in to view" message
        return;
    }
    if (!leagueId) {
        loadingMessage.textContent = "No league ID specified.";
        leagueContainer.classList.add('hidden');
        noAccessContainer.classList.remove('hidden');
        return;
    }
    
    loadingMessage.textContent = "Loading league data...";
    loadingMessage.classList.remove('hidden');
    leagueContainer.classList.add('hidden');
    noAccessContainer.classList.add('hidden');

    const leagueRef = ref(database, `leagues/${leagueId}`);
    get(leagueRef).then((snapshot) => {
        if (!snapshot.exists()) {
            loadingMessage.textContent = `League with ID '${leagueId}' not found.`;
            leagueContainer.classList.add('hidden');
            noAccessContainer.classList.add('hidden'); // Or show a specific "not found" message here
            throw new Error(`League not found: ${leagueId}`);
        }
        
        leagueData = snapshot.val();
        console.log("League data loaded:", leagueData);

        // User Access Control: Check if current user is part of this league's teams
        if (!leagueData.teams || !leagueData.teams[currentUser.uid]) {
            loadingMessage.classList.add('hidden');
            leagueContainer.classList.add('hidden');
            noAccessContainer.classList.remove('hidden'); // Show access denied message
            noAccessContainer.innerHTML = `<h2>Access Denied</h2><p>You are not a member of this league. Please join the league or select one of your leagues from <a href="manage-leagues.html">My Leagues</a>.</p>`;
            console.warn(`User ${currentUser.uid} is not a member of league ${leagueId}.`);
            return; // Stop further processing for this league
        }
        
        isCommissioner = leagueData.teams[currentUser.uid].isCommissioner || false;
        console.log(`User isCommissioner: ${isCommissioner}`);
        
        updateLeagueInfo(); // Update league name, description, member list, draft link
        
        // Start chained data loading
        return loadPlayerStats(); // Returns a promise
    })
    .then(() => {
        // This block executes after player stats are loaded (or attempted)
        return loadDraftedPlayers(); // Returns a promise
    })
    .then(() => {
        // This block executes after drafted players are loaded
        loadingMessage.classList.add('hidden');
        leagueContainer.classList.remove('hidden');
        noAccessContainer.classList.add('hidden');
        
        checkLiveGames(); // Initial check
        setInterval(checkLiveGames, 60000); 
        // Consider if draftedPlayers also needs periodic refresh or if Firebase onValue is better
        // For now, manual refresh or page reload might be expected for draft changes outside draftcentre.
        // setInterval(loadDraftedPlayers, 300000); 

        if (isCommissioner) {
            commissionerControlsEl.classList.remove('hidden');
            populateNHLTeamsSelector();
            setupCommissionerControls();
        }
    })
    .catch(error => {
        console.error("Error in loadLeagueData chain:", error);
        if (!leagueId){ // If error was due to no leagueId
             loadingMessage.textContent = "No league selected. Please select a league from the Manage Leagues page.";
        } else {
             loadingMessage.textContent = `Error loading league data: ${error.message}. Check console for details.`;
        }
        loadingMessage.classList.remove('hidden');
        leagueContainer.classList.add('hidden');
        noAccessContainer.classList.add('hidden');
    });
}

// Load player stats from updatedstats JSON file
async function loadPlayerStats() {
    try {
        const now = new Date();
        // Format to match 'YYYYMMDD' e.g. '20250527'
        const currentDate = now.toISOString().split('T')[0].replace(/-/g, ''); // Example: 20250527
        
        const rawGitHubBaseUrl = 'https://raw.githubusercontent.com/randyj18/Fantasy_Hockey/master/data/';
        const latestStatsFile = `${rawGitHubBaseUrl}updatedstats-${currentDate}.json`;
        
        let response = await fetch(latestStatsFile);
        
        if (!response.ok) {
            console.warn(`Stats file for today (${currentDate}) not found, trying yesterday's file`);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayDate = yesterday.toISOString().split('T')[0].replace(/-/g, ''); // Example: 20250526
            
            const yesterdayStatsFile = `${rawGitHubBaseUrl}updatedstats-${yesterdayDate}.json`;
            response = await fetch(yesterdayStatsFile);
            
            if (!response.ok) {
                console.warn(`Stats file for yesterday (${yesterdayDate}) also not found. Player stats will be empty.`);
                playerStats = {};
                playerStatsByID = {};
                return {}; // Return empty if no recent file found
            }
        }
        
        const data = await response.json();
        
        playerStats = {}; // Reset before populating
        playerStatsByID = {}; // Reset before populating

        if (Array.isArray(data)) { // Current format of updatedstats-*.json is an array
            data.forEach(playerEntry => {
                const id = playerEntry.playerId || playerEntry["Player ID"]; // Accommodate both potential ID fields
                if (id) {
                    // Ensure currentPlayoffStats exists and has the expected structure
                    const currentStats = playerEntry.currentPlayoffStats || {};
                    playerStatsByID[id.toString()] = {
                        goals: currentStats.Goals || 0,
                        assists: currentStats.Assists || 0,
                        wins: currentStats.Wins || 0,
                        shutouts: currentStats.Shutouts || 0,
                        // PointsBeforeAcquiring is directly from the playerEntry, not nested in currentPlayoffStats
                        pointsBeforeAcquiring: playerEntry.pointsBeforeAcquiring || 0 
                    };
                } else {
                    console.warn("Player entry without ID in stats file:", playerEntry);
                }
            });
        } else {
            console.warn("Unexpected format for stats file. Expected an array.", data);
        }
        
        console.log(`Loaded stats for ${Object.keys(playerStatsByID).length} players from JSON.`);
        return playerStatsByID;
        
    } catch (error) {
        console.error("Error loading player stats from JSON:", error);
        playerStats = {}; // Ensure reset on error
        playerStatsByID = {};
        return {}; // Return empty object so the app can continue
    }
}

// Update league info in the DOM
function updateLeagueInfo() {
    if (!leagueData) return;
    leagueNameEl.textContent = leagueData.name || "League Name Not Found";
    leagueDescriptionEl.textContent = leagueData.description || 'No description provided for this league.';
    
    // Dynamically set the draft link using the current leagueId
    draftLinkEl.href = `draftcentre.html?league=${leagueId}`;
    
    membersListEl.innerHTML = ''; // Clear previous members
    if (leagueData.teams) {
        Object.values(leagueData.teams).forEach(member => {
            const memberItem = document.createElement('div');
            memberItem.className = 'member-item';
            const commissionerBadge = member.isCommissioner ? '<span class="badge commissioner-badge">Commissioner</span>' : '';
            memberItem.innerHTML = `${member.name} ${commissionerBadge}`;
            membersListEl.appendChild(memberItem);
        });
    } else {
        membersListEl.innerHTML = '<p>No members found for this league.</p>';
    }
}

// Load drafted players data for the current league
function loadDraftedPlayers() {
    if (!leagueId) return Promise.reject("League ID not set, cannot load drafted players.");

    const draftedPlayersRef = ref(database, `leagues/${leagueId}/draftedPlayers`);
    const eliminatedPlayersRef = ref(database, `leagues/${leagueId}/eliminatedPlayers`);
    
    return Promise.all([
        get(draftedPlayersRef),
        get(eliminatedPlayersRef)
    ]).then(([draftedSnapshot, eliminatedSnapshot]) => {
        draftedPlayers = []; // Reset
        if (draftedSnapshot.exists()) {
            draftedPlayers = Object.entries(draftedSnapshot.val()).map(([key, player]) => ({
                ...player,
                firebaseKey: key, // Keep Firebase key for potential updates
                playerId: player.playerId || key 
            }));
        }
        
        eliminatedPlayers = new Set(); // Reset
        if (eliminatedSnapshot.exists()) {
            const eliminatedData = eliminatedSnapshot.val();
            Object.keys(eliminatedData).forEach(playerId => {
                if (eliminatedData[playerId] === true) {
                    eliminatedPlayers.add(playerId.toString()); // Ensure IDs are strings for Set comparison
                }
            });
        }
        
        processTeamRosters(); // Recalculate team rosters and stats
        
        // Update UI components that depend on drafted players
        populateTeamSelectors();
        updateStandingsTable();
        updateStandingsChart();
        updatePlayerTable();
        loadTeamRoster(); 
        loadTeamBreakdown(); 
        
        document.getElementById('lastUpdatedTime').textContent = new Date().toLocaleString();
        console.log("Drafted players and stats processed for league:", leagueId);
    }).catch(error => {
        console.error(`Error loading drafted players for league ${leagueId}:`, error);
        showNotification(`Error loading player data: ${error.message}`);
        // Potentially clear UI elements or show specific error messages in tables/charts
    });
}

// Process team rosters from drafted players
function processTeamRosters() {
    teamRosters = {};
    teamStats = {};
    
    if (leagueData && leagueData.teams) {
        Object.entries(leagueData.teams).forEach(([teamId, teamInfo]) => {
            teamRosters[teamId] = { teamName: teamInfo.name, forwards: [], defense: [], goalies: [] };
            teamStats[teamId] = { totalPoints: 0, forwardPoints: 0, defensePoints: 0, goaliePoints: 0, playerCount: 0, forwardCount: 0, defenseCount: 0, goalieCount: 0, activePlayerCount: 0, activeForwardCount: 0, activeDefenseCount: 0, activeGoalieCount: 0 };
        });
    }
    
    draftedPlayers.forEach(player => {
        const teamId = player.teamUid;
        if (!teamRosters[teamId]) {
            console.warn(`Team ${teamId} not found in leagueData.teams for player ${player.Player}`);
            return; 
        }
        
        let playerPoints = calculatePlayerPoints(player);
        
        let positionGroup = 'forwards';
        if (player.Position === 'D') positionGroup = 'defense';
        else if (player.Position === 'G') positionGroup = 'goalies';
        
        const isPlayerEliminated = eliminatedPlayers.has(player.playerId.toString());
        teamRosters[teamId][positionGroup].push({ ...player, points: playerPoints, isEliminated: isPlayerEliminated });
        
        if (!isPlayerEliminated) { // Only count points from active players towards team totals
            teamStats[teamId].totalPoints += playerPoints;
            if (positionGroup === 'forwards') teamStats[teamId].forwardPoints += playerPoints;
            else if (positionGroup === 'defense') teamStats[teamId].defensePoints += playerPoints;
            else if (positionGroup === 'goalies') teamStats[teamId].goaliePoints += playerPoints;
        }
        
        teamStats[teamId].playerCount++;
        if (positionGroup === 'forwards') teamStats[teamId].forwardCount++;
        else if (positionGroup === 'defense') teamStats[teamId].defenseCount++;
        else if (positionGroup === 'goalies') teamStats[teamId].goalieCount++;
        
        if (!isPlayerEliminated) {
            teamStats[teamId].activePlayerCount++;
            if (positionGroup === 'forwards') teamStats[teamId].activeForwardCount++;
            else if (positionGroup === 'defense') teamStats[teamId].activeDefenseCount++;
            else if (positionGroup === 'goalies') teamStats[teamId].activeGoalieCount++;
        }
    });
    
    Object.values(teamRosters).forEach(team => {
        team.forwards.sort((a, b) => b.points - a.points);
        team.defense.sort((a, b) => b.points - a.points);
        team.goalies.sort((a, b) => b.points - a.points);
    });
}

// Calculate player points from stats
function calculatePlayerPoints(player) {
    const playerId = player.playerId.toString(); // Ensure string for lookup
    const position = player.Position;
    let points = 0;
    
    const playerStatEntry = playerStatsByID[playerId]; // playerStatsByID uses string keys
    
    if (playerStatEntry) {
        // Points are based on *current* playoff stats fetched from the JSON file
        if (position === 'G') {
            points = (playerStatEntry.wins * 2) + (playerStatEntry.shutouts);
        } else {
            points = playerStatEntry.goals + playerStatEntry.assists;
        }
        
        // Subtract points earned *before* the player was acquired, if applicable
        // This uses the 'pointsBeforeAcquiring' stored with the draftedPlayer in Firebase
        if (player.playoffRoundDrafted > 1 && player.pointsBeforeAcquiring) {
             // Only subtract if preAcqRound matches the round they were drafted.
             // This means pointsBeforeAcquiring are for the stats *up to* the start of playoffRoundDrafted.
            if (player.preAcqRound === player.playoffRoundDrafted) {
                points -= player.pointsBeforeAcquiring;
            } else {
                // This case implies that update_playerlist.py hasn't yet run for this specific acquisition round.
                // Log a warning, but still use current total points as a fallback, as pointsBeforeAcquiring might be stale.
                console.warn(`Player ${player.Player} (ID: ${playerId}) drafted in round ${player.playoffRoundDrafted}, but preAcqRound is ${player.preAcqRound}. Using total current playoff points until updated.`);
            }
        }
         // Ensure points don't go negative if pre-acquisition stats are higher (e.g., due to stat corrections)
        points = Math.max(0, points);

    } else {
        console.warn(`No current playoff stats found for player ${player.Player} (ID: ${playerId}) in playerStatsByID. Defaulting to 0 points.`);
    }
    
    return points;
}

// Populate team selectors in different tabs
function populateTeamSelectors() {
    const rosterSelect = document.getElementById('roster-team-select');
    const breakdownSelect = document.getElementById('breakdown-team-select');
    
    // Clear existing options
    rosterSelect.innerHTML = '';
    breakdownSelect.innerHTML = '';
    
    // Add options for each team
    let userTeamOption = null;
    
    if (leagueData && leagueData.teams) {
        // Sort teams alphabetically
        const sortedTeams = Object.entries(leagueData.teams)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name));
        
        sortedTeams.forEach(([teamId, team]) => {
            const option = document.createElement('option');
            option.value = teamId;
            option.textContent = team.name;
            
            // Create clones for each select
            const rosterOption = option.cloneNode(true);
            const breakdownOption = option.cloneNode(true);
            
            rosterSelect.appendChild(rosterOption);
            breakdownSelect.appendChild(breakdownOption);
            
            // Save user's team option for setting initial selection
            if (teamId === currentUser.uid) {
                userTeamOption = {
                    id: teamId,
                    name: team.name
                };
            }
        });
    }
    
    // Set initial selections to user's team
    if (userTeamOption) {
        rosterSelect.value = userTeamOption.id;
        breakdownSelect.value = userTeamOption.id;
    }
}
// Update the standings table
function updateStandingsTable() {
    const tableBody = document.getElementById('standingsTableBody');
    tableBody.innerHTML = '';
    
    if (!teamStats || Object.keys(teamStats).length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7">No data available</td></tr>';
        return;
    }
    
    // Sort teams by total points
    const sortedTeams = Object.entries(teamStats)
        .sort(([, a], [, b]) => b.totalPoints - a.totalPoints);
    
    // Add each team to the table
    sortedTeams.forEach(([teamId, stats], index) => {
        const teamName = leagueData.teams[teamId]?.name || 'Unknown Team';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${teamName}</td>
            <td>${stats.activeForwardCount}/${stats.forwardCount}</td>
            <td>${stats.activeDefenseCount}/${stats.defenseCount}</td>
            <td>${stats.activeGoalieCount}/${stats.goalieCount}</td>
            <td>${stats.activePlayerCount}/${stats.playerCount}</td>
            <td>${stats.totalPoints}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Update the standings chart
function updateStandingsChart() {
    const ctx = document.getElementById('standingsChart').getContext('2d');
    
    if (!teamStats || Object.keys(teamStats).length === 0) {
        return;
    }
    
    // Sort teams by total points
    const sortedTeams = Object.entries(teamStats)
        .sort(([, a], [, b]) => b.totalPoints - a.totalPoints);
    
    const teamNames = sortedTeams.map(([teamId]) => 
        leagueData.teams[teamId]?.name || 'Unknown Team'
    );
    
    const data = {
        labels: teamNames,
        datasets: [{
            label: 'Total Points',
            data: sortedTeams.map(([, stats]) => stats.totalPoints),
            backgroundColor: 'rgba(0, 51, 102, 0.7)',
            borderColor: 'rgba(0, 51, 102, 1)',
            borderWidth: 1
        }]
    };
    
    // Destroy existing chart if it exists
    if (chartObjects.standings) {
        chartObjects.standings.destroy();
    }
    
    // Create new chart
    chartObjects.standings = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true
                }
            },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Update the player stats table
function updatePlayerTable() {
    const tableBody = document.getElementById('playerTableBody');
    tableBody.innerHTML = '';
    
    if (!draftedPlayers || draftedPlayers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10">No drafted players available</td></tr>';
        return;
    }
    
    // Sort players by points
    const sortedPlayers = [...draftedPlayers]
        .sort((a, b) => calculatePlayerPoints(b) - calculatePlayerPoints(a));
    
    // Add each player to the table
    sortedPlayers.forEach(player => {
        const points = calculatePlayerPoints(player);
        const isPlayerEliminated = eliminatedPlayers.has(player.playerId.toString());
        const teamName = leagueData.teams[player.teamUid]?.name || 'Unknown Team';
        
        // Get player stats
        const playerStat = playerStatsByID[player.playerId.toString()] || {};
        const isGoalie = player.Position === 'G';
        
        // Get actual stats from playerStat or default to 0
        const goals = isGoalie ? '-' : (playerStat.goals || 0);
        const assists = isGoalie ? '-' : (playerStat.assists || 0);
        const wins = isGoalie ? (playerStat.wins || 0) : '-';
        const shutouts = isGoalie ? (playerStat.shutouts || 0) : '-';
        
        const row = document.createElement('tr');
        row.classList.toggle('eliminated-player', isPlayerEliminated);
        
        row.innerHTML = `
            <td>${player.Player}</td>
            <td>${player['NHL Team']}</td>
            <td>${teamName}</td>
            <td>${player.Position}</td>
            <td>${points}</td>
            <td>${goals}</td>
            <td>${assists}</td>
            <td>${wins}</td>
            <td>${shutouts}</td>
            <td>${isPlayerEliminated ? 'Eliminated' : 'Active'}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Load team roster for selected team
window.loadTeamRoster = function() {
    const teamId = document.getElementById('roster-team-select').value;
    
    if (!teamId || !teamRosters[teamId]) {
        console.error('Team not found:', teamId);
        return;
    }
    
    const team = teamRosters[teamId];
    const stats = teamStats[teamId];
    
    // Update team summary stats
    document.getElementById('total-players').textContent = stats.playerCount;
    document.getElementById('active-players').textContent = stats.activePlayerCount;
    document.getElementById('total-points').textContent = stats.totalPoints;
    
    // Update position counts
    document.getElementById('forwards-count').textContent = `${stats.activeForwardCount}/${stats.forwardCount}`;
    document.getElementById('defense-count').textContent = `${stats.activeDefenseCount}/${stats.defenseCount}`;
    document.getElementById('goalies-count').textContent = `${stats.activeGoalieCount}/${stats.goalieCount}`;
    
    document.getElementById('forwards-active-count').textContent = `${stats.activeForwardCount}/${stats.forwardCount}`;
    document.getElementById('defense-active-count').textContent = `${stats.activeDefenseCount}/${stats.defenseCount}`;
    document.getElementById('goalies-active-count').textContent = `${stats.activeGoalieCount}/${stats.goalieCount}`;
    
    // Populate position lists
    populatePositionList('forwards-list', team.forwards, teamId);
    populatePositionList('defense-list', team.defense, teamId);
    populatePositionList('goalies-list', team.goalies, teamId);
};

// Populate a position list with players
function populatePositionList(elementId, players, teamId) {
    const list = document.getElementById(elementId);
    list.innerHTML = '';
    
    if (players.length === 0) {
        list.innerHTML = '<div class="player-card">No players drafted for this position</div>';
        return;
    }
    
    players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        if (player.isEliminated) {
            playerCard.classList.add('eliminated-player');
        }
        
        // Get player stats for display
        const playerStat = playerStatsByID[player.playerId.toString()] || {};
        const isGoalie = player.Position === 'G';
        let statsDisplay = '';
        
        if (isGoalie) {
            const wins = playerStat.wins || 0;
            const shutouts = playerStat.shutouts || 0;
            statsDisplay = `W: ${wins}, SO: ${shutouts}`;
        } else {
            const goals = playerStat.goals || 0;
            const assists = playerStat.assists || 0;
            statsDisplay = `G: ${goals}, A: ${assists}`;
        }
        
        // Determine if commissioner controls should be shown
        const showControls = isCommissioner;
        let controlButton = '';
        
        if (showControls) {
            if (player.isEliminated) {
                controlButton = `<button class="btn secondary elimyination-btn" data-player-id="${player.playerId}" onclick="restorePlayer('${player.playerId}')">Restore</button>`;
            } else {
                controlButton = `<button class="btn danger elimyination-btn" data-player-id="${player.playerId}" onclick="eliminatePlayer('${player.playerId}')">Eliminate</button>`;
            }
        }
        
        playerCard.innerHTML = `
            <div class="player-info">
                <div class="player-name">${player.Player}</div>
                <div class="player-team">${player['NHL Team']} - ${player.Position}</div>
                <div class="player-team">${statsDisplay}</div>
            </div>
            <div class="player-stats">
                <div class="player-points">${player.points} pts</div>
                ${showControls ? `<div class="player-actions">${controlButton}</div>` : ''}
            </div>
        `;
        
        list.appendChild(playerCard);
    });
}

// Load team breakdown for selected team
window.loadTeamBreakdown = function() {
    const teamId = document.getElementById('breakdown-team-select').value;
    
    if (!teamId || !teamRosters[teamId]) {
        console.error('Team not found:', teamId);
        return;
    }
    
    const team = teamRosters[teamId];
    const stats = teamStats[teamId];
    
    // Update player breakdown chart
    updatePlayerBreakdownChart(team, teamId);
    
    // Update position breakdown chart
    updatePositionBreakdownChart(stats);
    
    // Update top contributors table
    updateContributorsTable(team, teamId);
};

// Update player breakdown chart
function updatePlayerBreakdownChart(team, teamId) {
    const ctx = document.getElementById('playerBreakdownChart').getContext('2d');
    
    // Combine all players from different positions
    const allTeamPlayers = [ // Renamed to avoid conflict with global allPlayers
        ...team.forwards,
        ...team.defense,
        ...team.goalies
    ].sort((a, b) => b.points - a.points);
    
    // Take top 10 players for clarity
    const topPlayers = allTeamPlayers.slice(0, 10);
    
    const data = {
        labels: topPlayers.map(p => p.Player),
        datasets: [{
            label: 'Points',
            data: topPlayers.map(p => p.points),
            backgroundColor: topPlayers.map(p => {
                if (p.isEliminated) {
                    return 'rgba(108, 117, 125, 0.6)'; // Grey for eliminated
                }
                if (p.Position === 'G') {
                    return 'rgba(255, 99, 132, 0.6)'; // Red for goalies
                } else if (p.Position === 'D') {
                    return 'rgba(54, 162, 235, 0.6)'; // Blue for defense
                } else {
                    return 'rgba(75, 192, 192, 0.6)'; // Teal for forwards
                }
            }),
            borderColor: topPlayers.map(p => {
                if (p.isEliminated) {
                    return 'rgba(108, 117, 125, 1)';
                }
                if (p.Position === 'G') {
                    return 'rgba(255, 99, 132, 1)';
                } else if (p.Position === 'D') {
                    return 'rgba(54, 162, 235, 1)';
                } else {
                    return 'rgba(75, 192, 192, 1)';
                }
            }),
            borderWidth: 1
        }]
    };
    
    // Destroy existing chart if it exists
    if (chartObjects.playerBreakdown) {
        chartObjects.playerBreakdown.destroy();
    }
    
    // Create new chart
    chartObjects.playerBreakdown = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        title: (tooltipItems) => {
                            const index = tooltipItems[0].dataIndex;
                            return topPlayers[index].Player;
                        },
                        label: (tooltipItem) => {
                            const index = tooltipItem.dataIndex;
                            const player = topPlayers[index];
                            return [
                                `Points: ${player.points}`,
                                `Position: ${player.Position}`,
                                `Team: ${player['NHL Team']}`,
                                `Status: ${player.isEliminated ? 'Eliminated' : 'Active'}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Points'
                    }
                }
            }
        }
    });
}
// Update position breakdown chart
function updatePositionBreakdownChart(stats) {
    const ctx = document.getElementById('positionBreakdownChart').getContext('2d');
    
    const data = {
        labels: ['Forwards', 'Defense', 'Goalies'],
        datasets: [{
            label: 'Points by Position',
            data: [stats.forwardPoints, stats.defensePoints, stats.goaliePoints],
            backgroundColor: [
                'rgba(75, 192, 192, 0.6)',
                'rgba(54, 162, 235, 0.6)',
                'rgba(255, 99, 132, 0.6)'
            ],
            borderColor: [
                'rgba(75, 192, 192, 1)',
                'rgba(54, 162, 235, 1)',
                'rgba(255, 99, 132, 1)'
            ],
            borderWidth: 1
        }]
    };
    
    // Destroy existing chart if it exists
    if (chartObjects.positionBreakdown) {
        chartObjects.positionBreakdown.destroy();
    }
    
    // Create new chart
    chartObjects.positionBreakdown = new Chart(ctx, {
        type: 'pie',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (tooltipItem) => {
                            const label = tooltipItem.label;
                            const value = tooltipItem.raw;
                            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                            return `${label}: ${value} points (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Update top contributors table
function updateContributorsTable(team, teamId) {
    const tableBody = document.getElementById('contributorsTableBody');
    tableBody.innerHTML = '';
    
    // Combine all players from different positions
    const allTeamPlayers = [ // Renamed to avoid conflict
        ...team.forwards,
        ...team.defense,
        ...team.goalies
    ].sort((a, b) => b.points - a.points);
    
    // Take top 10 players for the table
    const topPlayers = allTeamPlayers.slice(0, 10);
    
    if (topPlayers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3">No players drafted</td></tr>';
        return;
    }
    
    topPlayers.forEach(player => {
        const row = document.createElement('tr');
        if (player.isEliminated) {
            row.classList.add('eliminated-player');
        }
        
        row.innerHTML = `
            <td>${player.Player}</td>
            <td>${player.Position}</td>
            <td>${player.points}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Check if any games are currently live
function checkLiveGames() {
    if (!leagueId) return; // Don't check if no league is loaded
    try {
        // Check NHL API for active games
        fetch('https://api-web.nhle.com/v1/schedule/now')
            .then(response => response.json())
            .then(data => {
                // Check if there are any active games
                isLiveGame = data.gameWeek && 
                                data.gameWeek.some(day => 
                                    day.games && day.games.some(game => 
                                        game.gameState === 'LIVE' || game.gameState === 'PREVIEW'
                                    )
                                );
                
                // Show/hide live indicator
                const liveIndicator = document.getElementById('liveIndicator');
                liveIndicator.style.display = isLiveGame ? 'inline-block' : 'none';
                
                // If games are live, refresh data more frequently
                if (isLiveGame) {
                    loadPlayerStats().then(() => {
                        loadDraftedPlayers(); // This will re-process rosters and update UI
                    });
                }
            })
            .catch(error => {
                console.error('Error checking live games:', error);
                isLiveGame = false;
                document.getElementById('liveIndicator').style.display = 'none';
            });
    } catch (error) {
        console.error('Error checking live games:', error);
        isLiveGame = false;
        document.getElementById('liveIndicator').style.display = 'none';
    }
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after animation completes
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// --- Commissioner Functionality ---

// Populate NHL teams multi-select
function populateNHLTeamsSelector() {
    const eliminationTeam = document.getElementById('elimination-team');
    eliminationTeam.innerHTML = '';
    
    // Sort team names alphabetically
    const sortedTeams = Object.entries(nhlTeams)
        .sort(([, a], [, b]) => a.localeCompare(b));
    
    sortedTeams.forEach(([abbr, name]) => {
        const option = document.createElement('option');
        option.value = abbr;
        option.textContent = name;
        eliminationTeam.appendChild(option);
    });
}

// Setup commissioner control buttons
function setupCommissionerControls() {
    if (!isCommissioner || !leagueId) return; // Ensure leagueId is available
    document.getElementById('mark-eliminated-btn').addEventListener('click', markTeamsEliminated);
    document.getElementById('restore-eliminated-btn').addEventListener('click', restoreTeamsEliminated);
}

// Eliminate individual player
window.eliminatePlayer = function(playerId) {
    if (!isCommissioner || !leagueId) {
        showNotification("Only commissioners can perform this action or league not loaded.");
        return;
    }
    
    const player = draftedPlayers.find(p => p.playerId === playerId);
    if (!player) {
        showNotification("Player not found");
        return;
    }
    
    set(ref(database, `leagues/${leagueId}/eliminatedPlayers/${playerId}`), true)
        .then(() => {
            showNotification(`${player.Player} marked as eliminated`);
            loadDraftedPlayers(); 
        })
        .catch(error => {
            console.error("Error eliminating player:", error);
            showNotification(`Error: ${error.message}`);
        });
};

// Restore individual player
window.restorePlayer = function(playerId) {
    if (!isCommissioner || !leagueId) {
        showNotification("Only commissioners can perform this action or league not loaded.");
        return;
    }
    
    const player = draftedPlayers.find(p => p.playerId === playerId);
    if (!player) {
        showNotification("Player not found");
        return;
    }
    
    set(ref(database, `leagues/${leagueId}/eliminatedPlayers/${playerId}`), null) // Set to null to remove
        .then(() => {
            showNotification(`${player.Player} restored`);
            loadDraftedPlayers(); 
        })
        .catch(error => {
            console.error("Error restoring player:", error);
            showNotification(`Error: ${error.message}`);
        });
};

// Mark teams as eliminated
function markTeamsEliminated() {
    if (!isCommissioner || !leagueId) {
        showNotification("Only commissioners can perform this action or league not loaded.");
        return;
    }
    
    const eliminationTeam = document.getElementById('elimination-team');
    const selectedTeams = Array.from(eliminationTeam.selectedOptions).map(option => option.value);
    
    if (selectedTeams.length === 0) {
        showNotification("Please select at least one team to mark as eliminated");
        return;
    }
    
    const teamNames = selectedTeams.map(abbr => nhlTeams[abbr]).join(", ");
    if (!confirm(`Are you sure you want to mark all players from ${teamNames} as eliminated?`)) {
        return;
    }
    
    const playersToEliminate = draftedPlayers.filter(player => 
        selectedTeams.includes(player['NHL Team']) && !eliminatedPlayers.has(player.playerId.toString())
    );
    
    if (playersToEliminate.length === 0) {
        showNotification("No active players found from the selected teams to eliminate.");
        return;
    }
    
    const updates = {};
    playersToEliminate.forEach(player => {
        updates[`leagues/${leagueId}/eliminatedPlayers/${player.playerId}`] = true;
    });
    
    update(ref(database), updates)
        .then(() => {
            showNotification(`${playersToEliminate.length} players marked as eliminated`);
            loadDraftedPlayers(); 
        })
        .catch(error => {
            console.error("Error marking players as eliminated:", error);
            showNotification(`Error: ${error.message}`);
        });
}

// Restore eliminated teams
function restoreTeamsEliminated() {
    if (!isCommissioner || !leagueId) {
        showNotification("Only commissioners can perform this action or league not loaded.");
        return;
    }
    
    const eliminationTeam = document.getElementById('elimination-team');
    const selectedTeams = Array.from(eliminationTeam.selectedOptions).map(option => option.value);
    
    if (selectedTeams.length === 0) {
        showNotification("Please select at least one team to restore");
        return;
    }
    
    const teamNames = selectedTeams.map(abbr => nhlTeams[abbr]).join(", ");
    if (!confirm(`Are you sure you want to restore all players from ${teamNames}?`)) {
        return;
    }
    
    const playersToRestore = draftedPlayers.filter(player => 
        selectedTeams.includes(player['NHL Team']) && eliminatedPlayers.has(player.playerId.toString())
    );
    
    if (playersToRestore.length === 0) {
        showNotification("No eliminated players found from the selected teams to restore.");
        return;
    }
    
    const updates = {};
    playersToRestore.forEach(player => {
        updates[`leagues/${leagueId}/eliminatedPlayers/${player.playerId}`] = null; // Set to null to remove
    });
    
    update(ref(database), updates)
        .then(() => {
            showNotification(`${playersToRestore.length} players restored`);
            loadDraftedPlayers(); 
        })
        .catch(error => {
            console.error("Error restoring players:", error);
            showNotification(`Error: ${error.message}`);
        });
}

// Set up tab navigation
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs and contents
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        // Refresh charts if needed
        if (tabId === 'team-breakdown') {
            if (chartObjects.playerBreakdown) chartObjects.playerBreakdown.update();
            if (chartObjects.positionBreakdown) chartObjects.positionBreakdown.update();
        } else if (tabId === 'standings') {
            if (chartObjects.standings) chartObjects.standings.update();
        }
    });
});

// Expose functions to window for inline handlers
window.loadTeamRoster = loadTeamRoster;
window.loadTeamBreakdown = loadTeamBreakdown;
window.eliminatePlayer = eliminatePlayer;
window.restorePlayer = restorePlayer;

// Call initializeLeaguePage on script load to get leagueId
initializeLeaguePage();
