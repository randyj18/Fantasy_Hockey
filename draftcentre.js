import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, get, update, off, query, limitToLast, serverTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Placeholder Firebase configuration
const fallbackFirebaseConfig = {
    apiKey: "PLACEHOLDER_API_KEY",
    authDomain: "playofffantasyhockey.firebaseapp.com",
    databaseURL: "https://playofffantasyhockey-default-rtdb.firebaseio.com",
    projectId: "playofffantasyhockey",
    storageBucket: "playofffantasyhockey.appspot.com",
    messagingSenderId: "PLACEHOLDER_SENDER_ID",
    appId: "PLACEHOLDER_APP_ID"
};

const app = initializeApp(window.firebaseConfig || fallbackFirebaseConfig);
const auth = getAuth();
setPersistence(auth, browserSessionPersistence).catch(console.error);
const provider = new GoogleAuthProvider();
const database = getDatabase();

// --- Global State ---
let currentUser = null;
let allPlayers = [];
let draftedPlayers = [];
let eliminatedPlayers = new Set();
let eliminatedNHLTeams = new Set();
let leagueData = null;
let leagueId = null;
let currentPositionFilter = 'all';
let currentSortColumn = null;
let currentSortDirection = 'asc';
let currentTeams = {};
let isCommissioner = false;
let commissionerModeActive = false;
let chatListeners = {};
let playerListeners = {};
let draftStatusListener = null;
let eliminatedPlayersListener = null;
let eliminatedTeamsListener = null;

// Draft Queue Variables
let myDraftQueue = [];
let draftQueueListener = null;

// Playoff round draft state
let currentRound = 1;
let bankedPicks = {};
let nextRoundDraftOrder = [];

// --- DOM Elements ---
let loginBtn, logoutBtn, authStatus, contentContainer, leagueSelectContainer, leagueListEl, draftContainer;
let leagueInfoContainer, leagueNameEl, leagueTeamCountEl, draftedTeamFilter, startDraftBtn;
let currentDrafterContainer, currentDrafterName, playerTableBody, draftedTableBody;
let chatContainer, chatMessages, chatInput, chatSend, chatHeader, chatToggle, backToLeagueLink;
let commissionerControls, commissionerModeToggle, draftQueueList, emptyQueueMessage;
let roundDisplay, currentRoundNumber, concludeRoundBtn, bankPickBtn, bankedPicksInfo;
let currentTeamBankedPicks, draftOrderManager, draftOrderList, bankedPicksList;
let saveDraftOrderBtn, cancelDraftOrderBtn;

// Initialize DOM elements
function initializeDOM() {
    loginBtn = document.getElementById('login-btn');
    logoutBtn = document.getElementById('logout-btn');
    authStatus = document.getElementById('auth-status');
    contentContainer = document.getElementById('content-container');
    leagueSelectContainer = document.getElementById('league-select-container');
    leagueListEl = document.getElementById('league-list');
    draftContainer = document.getElementById('draft-container');
    leagueInfoContainer = document.getElementById('league-info');
    leagueNameEl = document.getElementById('league-name');
    leagueTeamCountEl = document.getElementById('league-team-count');
    draftedTeamFilter = document.getElementById('draftedTeamFilter');
    startDraftBtn = document.getElementById('start-draft-btn');
    currentDrafterContainer = document.getElementById('current-drafter');
    currentDrafterName = document.getElementById('current-drafter-name');
    playerTableBody = document.getElementById('playerTableBody');
    draftedTableBody = document.getElementById('draftedTableBody');
    chatContainer = document.getElementById('chat-container');
    chatMessages = document.getElementById('chat-messages');
    chatInput = document.getElementById('chat-input');
    chatSend = document.getElementById('chat-send');
    chatHeader = document.getElementById('chat-header');
    chatToggle = document.getElementById('chat-toggle');
    backToLeagueLink = document.getElementById('back-to-league-link');
    commissionerControls = document.getElementById('commissioner-controls');
    commissionerModeToggle = document.getElementById('commissioner-mode-toggle');
    draftQueueList = document.getElementById('draft-queue-list');
    emptyQueueMessage = document.getElementById('empty-queue-message');
    roundDisplay = document.getElementById('round-display');
    currentRoundNumber = document.getElementById('current-round-number');
    concludeRoundBtn = document.getElementById('conclude-round-btn');
    bankPickBtn = document.getElementById('bank-pick-btn');
    bankedPicksInfo = document.getElementById('banked-picks-info');
    currentTeamBankedPicks = document.getElementById('current-team-banked-picks');
    draftOrderManager = document.getElementById('draft-order-manager');
    draftOrderList = document.getElementById('draft-order-list');
    bankedPicksList = document.getElementById('banked-picks-list');
    saveDraftOrderBtn = document.getElementById('save-draft-order-btn');
    cancelDraftOrderBtn = document.getElementById('cancel-draft-order-btn');

    return loginBtn && logoutBtn && authStatus && contentContainer;
}

// --- Initialization ---
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('league')) {
    leagueId = urlParams.get('league');
}

// --- Auth ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        authStatus.textContent = `Signed in as ${user.displayName}`;
        contentContainer.classList.remove('hidden');
        storeUserProfile(user);

        if (leagueId) {
            loadLeague(leagueId);
            backToLeagueLink.href = `league.html?id=${leagueId}`;
            backToLeagueLink.classList.remove('hidden');
        } else {
            loadUserLeagues();
            backToLeagueLink.classList.add('hidden');
        }
    } else {
        currentUser = null;
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        authStatus.textContent = 'You are not signed in';
        contentContainer.classList.add('hidden');
        if (chatContainer) chatContainer.classList.add('hidden');
        if (backToLeagueLink) backToLeagueLink.classList.add('hidden');
        if (commissionerControls) commissionerControls.classList.add('hidden');
        cleanupListeners();
        resetUIState();
    }
});

function storeUserProfile(user) {
    const userRef = ref(database, `users/${user.uid}/profile`);
    update(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL || null,
        lastLogin: serverTimestamp()
    }).catch(error => console.error("Error storing user profile:", error));
}

function resetUIState() {
    if (leagueListEl) leagueListEl.innerHTML = '';
    if (playerTableBody) playerTableBody.innerHTML = '';
    if (draftedTableBody) draftedTableBody.innerHTML = '';
    if (draftedTeamFilter) draftedTeamFilter.innerHTML = '<option value="all">All Teams</option>';
    if (leagueNameEl) leagueNameEl.textContent = '';
    if (leagueTeamCountEl) leagueTeamCountEl.textContent = '';
    if (currentDrafterName) currentDrafterName.textContent = 'Draft not started';
    if (currentDrafterContainer) currentDrafterContainer.classList.add('hidden');
    if (startDraftBtn) startDraftBtn.classList.add('hidden');
    if (draftQueueList) draftQueueList.innerHTML = '';
    if (emptyQueueMessage) emptyQueueMessage.classList.remove('hidden');

    allPlayers = [];
    draftedPlayers = [];
    myDraftQueue = [];
    leagueData = null;
    currentTeams = {};
    isCommissioner = false;
    commissionerModeActive = false;
}

// --- League Loading ---
function loadUserLeagues() {
    if (!currentUser) return;
    resetUIState();
    leagueSelectContainer.classList.remove('hidden');
    draftContainer.classList.add('hidden');
    leagueInfoContainer.classList.add('hidden');
    leagueListEl.innerHTML = '<div class="loader"></div>';

    const userLeaguesRef = ref(database, `users/${currentUser.uid}/leagues`);
    get(userLeaguesRef).then((snapshot) => {
        leagueListEl.innerHTML = '';
        if (snapshot.exists()) {
            const leagues = snapshot.val();
            if (typeof leagues === 'object' && leagues !== null) {
                const leagueEntries = Object.values(leagues);
                if (leagueEntries.length > 0) {
                    leagueEntries
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                        .forEach(league => {
                            if (league && league.leagueId && league.name) {
                                const leagueItem = document.createElement('div');
                                leagueItem.className = 'league-item';
                                leagueItem.innerHTML = `
                                    <div>
                                        <div class="league-name">${league.name}</div>
                                        <div class="league-details">Role: ${league.role || 'Member'}</div>
                                    </div>
                                    <a href="draftcentre.html?league=${league.leagueId}" class="btn">Open Draft</a>
                                `;
                                leagueListEl.appendChild(leagueItem);
                            }
                        });
                } else {
                    leagueListEl.innerHTML = '<p>You haven\'t joined any leagues yet.</p>';
                }
            }
        } else {
            leagueListEl.innerHTML = '<p>You haven\'t joined any leagues yet.</p>';
        }
    }).catch((error) => {
        console.error("Error loading leagues:", error);
        leagueListEl.innerHTML = `<p>Error loading leagues: ${error.message}</p>`;
        showNotification(`Error loading your leagues: ${error.message}`, 7000);
    });
}

function loadLeague(leagueIdToLoad) {
    if (!currentUser || !leagueIdToLoad) {
        console.error("Cannot load league without user or league ID");
        loadUserLeagues();
        return;
    }
    resetUIState();
    leagueId = leagueIdToLoad;
    console.log(`Loading league: ${leagueId}`);

    const leagueRef = ref(database, `leagues/${leagueId}`);
    get(leagueRef).then((snapshot) => {
        if (snapshot.exists()) {
            leagueData = snapshot.val();
            console.log("League data loaded:", leagueData);

            if (!leagueData.teams || !leagueData.teams[currentUser.uid]) {
                handleNoAccessToLeague(leagueData);
                return;
            }

            isCommissioner = leagueData.teams[currentUser.uid]?.isCommissioner ?? false;
            console.log(`User is commissioner: ${isCommissioner}`);

            showDraftInterface();
            setupLeagueListeners();
            loadPlayerData();
        } else {
            console.error(`League with ID ${leagueId} not found.`);
            showNotification("League not found.");
            leagueId = null;
            cleanupListeners();
            loadUserLeagues();
        }
    }).catch((error) => {
        console.error(`Error loading league ${leagueId}:`, error);
        showNotification(`Error loading league: ${error.message}`, 7000);
        leagueId = null;
        cleanupListeners();
        loadUserLeagues();
    });
}

function handleNoAccessToLeague(leagueDataToShow) {
    resetUIState();
    leagueSelectContainer.classList.remove('hidden');
    
    const leagueName = leagueDataToShow?.name ?? 'this league';
    if (leagueListEl) {
        leagueListEl.innerHTML = `
            <div class="card" style="border-color: #dc3545;">
                <h2>Access Denied</h2>
                <p>You are not a member of "${leagueName}".</p>
                <p>Your account (${currentUser?.email}) is not listed under the league's teams.</p>
                <a href="manage-leagues.html" class="btn secondary">Go to Manage Leagues</a>
            </div>`;
    }
    cleanupListeners();
    leagueId = null;
}

// --- Draft Interface Setup ---
function showDraftInterface() {
    leagueSelectContainer.classList.add('hidden');
    draftContainer.classList.remove('hidden');
    leagueInfoContainer.classList.remove('hidden');
    if (chatContainer) chatContainer.classList.remove('hidden');

    if (leagueNameEl) leagueNameEl.textContent = leagueData?.name ?? 'League Name';
    const teamCount = Object.keys(leagueData?.teams ?? {}).length;
    if (leagueTeamCountEl) leagueTeamCountEl.textContent = `${teamCount} Teams`;

    populateTeamFilter();
    setupCommissionerControls();

    // Listen for draft status changes
    if (draftStatusListener) {
        const draftStatusRef = ref(database, `leagues/${leagueId}/draftStatus`);
        off(draftStatusRef, 'value', draftStatusListener);
    }
    const draftStatusRef = ref(database, `leagues/${leagueId}/draftStatus`);
    draftStatusListener = onValue(draftStatusRef, (snapshot) => {
        const draftStatus = snapshot.val();
        console.log("Draft status updated:", draftStatus);
        leagueData.draftStatus = draftStatus;
        updateDraftStatusUI(draftStatus);
        filterPlayers();
        updateDraftOrderDisplay();
    }, (error) => {
        console.error("Error reading draft status:", error);
        if (currentDrafterName) currentDrafterName.textContent = 'Error loading status';
        filterPlayers();
        showNotification("Error syncing draft status.", 7000);
    });

    if (startDraftBtn) {
        startDraftBtn.removeEventListener('click', startDraft);
        startDraftBtn.addEventListener('click', startDraft);
    }
}

function setupCommissionerControls() {
    if (isCommissioner && commissionerControls) {
        commissionerControls.classList.remove('hidden');
        if (commissionerModeToggle) {
            commissionerModeToggle.checked = commissionerModeActive;
            commissionerModeToggle.removeEventListener('change', handleCommissionerToggle);
            commissionerModeToggle.addEventListener('change', handleCommissionerToggle);
        }

        if (currentRoundNumber) {
            currentRoundNumber.textContent = currentRound.toString();
        }

        // Set up conclude round button
        if (concludeRoundBtn) {
            concludeRoundBtn.removeEventListener('click', handleConcludeRound);
            concludeRoundBtn.addEventListener('click', handleConcludeRound);
        }

        // Setup draft order manager save/cancel buttons
        if (saveDraftOrderBtn) {
            saveDraftOrderBtn.removeEventListener('click', handleSaveDraftOrder);
            saveDraftOrderBtn.addEventListener('click', handleSaveDraftOrder);
        }

        if (cancelDraftOrderBtn) {
            cancelDraftOrderBtn.removeEventListener('click', handleCancelDraftOrder);
            cancelDraftOrderBtn.addEventListener('click', handleCancelDraftOrder);
        }
    } else if (commissionerControls) {
        commissionerControls.classList.add('hidden');
        commissionerModeActive = false;
    }
}

function handleCommissionerToggle() {
    commissionerModeActive = commissionerModeToggle.checked;
    console.log(`Commissioner Mode ${commissionerModeActive ? 'Enabled' : 'Disabled'}`);
    filterPlayers();
    showNotification(`Commissioner Mode ${commissionerModeActive ? 'ON' : 'OFF'}`, 2000);
}

function updateDraftStatusUI(draftStatus) {
    const draftIsActive = draftStatus?.active ?? false;

    if (draftIsActive) {
        if (startDraftBtn) startDraftBtn.classList.add('hidden');
        if (currentDrafterContainer) currentDrafterContainer.classList.remove('hidden');

        const currentDrafterUid = draftStatus.currentDrafter;
        const draftRound = draftStatus.round || 1;
        const pickNumber = draftStatus.pickNumber || '?';

        if (roundDisplay) {
            roundDisplay.textContent = `Round ${currentRound}`;
        }

        if (currentDrafterUid && currentTeams[currentDrafterUid]) {
            const drafterTeamName = currentTeams[currentDrafterUid].name;
            let drafterText = `<strong>${drafterTeamName}</strong> (Round ${draftRound}, Pick ${pickNumber})`;

            if (currentDrafterUid === currentUser.uid) {
                currentDrafterContainer.classList.add('my-turn');
                drafterText += ' - <strong>Your Turn!</strong>';
            } else {
                currentDrafterContainer.classList.remove('my-turn');
            }
            if (currentDrafterName) currentDrafterName.innerHTML = drafterText;
        } else {
            if (currentDrafterName) currentDrafterName.textContent = `Updating... (Round ${draftRound})`;
            if (currentDrafterContainer) currentDrafterContainer.classList.remove('my-turn');
        }
    } else {
        if (isCommissioner && startDraftBtn) {
            startDraftBtn.classList.remove('hidden');
        } else if (startDraftBtn) {
            startDraftBtn.classList.add('hidden');
        }
        if (currentDrafterContainer) currentDrafterContainer.classList.add('hidden');
        if (currentDrafterName) currentDrafterName.textContent = 'Draft not started';
        if (currentDrafterContainer) currentDrafterContainer.classList.remove('my-turn');
    }
}

// --- Firebase Listeners ---
function setupLeagueListeners() {
    cleanupListeners();
    console.log(`Setting up listeners for league: ${leagueId}`);

    // Listener 1: Drafted Players changes
    const draftedPlayersRef = ref(database, `leagues/${leagueId}/draftedPlayers`);
    playerListeners.draftedPlayers = onValue(draftedPlayersRef, (snapshot) => {
        console.log("Drafted players data received.");
        const draftedData = snapshot.val() || {};
        draftedPlayers = Object.entries(draftedData)
            .map(([key, player]) => ({ ...player, firebaseKey: key }))
            .sort((a, b) => (a.draftedAt || 0) > (b.draftedAt || 0) ? 1 : -1)
            .map((player, index) => ({ ...player, draftNumber: index + 1 }));

        filterDraftedPlayers();
        filterPlayers();
    }, (error) => {
        console.error("Error reading drafted players:", error);
        showNotification("Error loading drafted players list.", 7000);
    });

    // Listener 2: League Teams changes
    const teamsRef = ref(database, `leagues/${leagueId}/teams`);
    playerListeners.teams = onValue(teamsRef, (snapshot) => {
        console.log("Teams data received.");
        const newTeamsData = snapshot.val() || {};
        const simplifiedTeams = {};
        Object.entries(newTeamsData).forEach(([uid, team]) => {
            simplifiedTeams[uid] = {
                name: team.name || `Team ${uid.substring(0, 4)}`,
                isCommissioner: team.isCommissioner || false,
                photoURL: team.owner?.photoURL || null
            };
        });

        currentTeams = simplifiedTeams;
        populateTeamFilter();
        updateDraftStatusUI(leagueData?.draftStatus);
    }, (error) => {
        console.error("Error reading league teams:", error);
        showNotification("Error loading team information.", 7000);
    });

    // Listener 3: Chat messages
    const chatRef = ref(database, `leagues/${leagueId}/chat`);
    const chatQuery = query(chatRef, limitToLast(50));
    chatListeners.chat = onValue(chatQuery, (snapshot) => {
        console.log("Chat data received.");
        updateChatMessages(snapshot.val() || {});
    }, (error) => {
        console.error("Error reading chat messages:", error);
        if (chatMessages) chatMessages.innerHTML = '<div class="chat-system error-message">Error loading chat messages.</div>';
    });

    // Listener 4: Eliminated Players
    const eliminatedPlayersRef = ref(database, `leagues/${leagueId}/eliminatedPlayers`);
    eliminatedPlayersListener = onValue(eliminatedPlayersRef, (snapshot) => {
        console.log("Eliminated players data received.");
        eliminatedPlayers = new Set();
        const eliminatedData = snapshot.val() || {};
        Object.entries(eliminatedData).forEach(([playerId, isEliminated]) => {
            if (isEliminated === true) {
                eliminatedPlayers.add(playerId);
            }
        });
        console.log(`${eliminatedPlayers.size} eliminated players loaded.`);
        filterPlayers();
        filterDraftedPlayers();
        updateDraftOrderDisplay();
    }, (error) => {
        console.error("Error reading eliminated players:", error);
        showNotification("Error loading eliminated players list.", 7000);
    });

    // Listener 5: Eliminated NHL Teams
    const eliminatedTeamsRef = ref(database, `leagues/${leagueId}/eliminatedNHLTeams`);
    eliminatedTeamsListener = onValue(eliminatedTeamsRef, (snapshot) => {
        console.log("Eliminated NHL teams data received.");
        eliminatedNHLTeams = new Set();
        const eliminatedData = snapshot.val() || {};
        Object.entries(eliminatedData).forEach(([teamCode, isEliminated]) => {
            if (isEliminated === true) {
                eliminatedNHLTeams.add(teamCode);
            }
        });
        console.log(`${eliminatedNHLTeams.size} eliminated NHL teams loaded:`, Array.from(eliminatedNHLTeams));
        filterPlayers();
        filterDraftedPlayers();
    }, (error) => {
        console.error("Error reading eliminated NHL teams:", error);
        showNotification("Error loading eliminated NHL teams list.", 7000);
    });

    // Listener 6: Playoff Round Data
    const playoffRoundRef = ref(database, `leagues/${leagueId}/playoffRound`);
    playerListeners.playoffRound = onValue(playoffRoundRef, (snapshot) => {
        console.log("🔥 Playoff round data received.");
        const playoffData = snapshot.val() || {};
        console.log("🔥 Raw playoff data from Firebase:", playoffData);
        
        const previousRound = currentRound;
        currentRound = playoffData.currentRound || 1;
        bankedPicks = playoffData.bankedPicks || {};
        nextRoundDraftOrder = playoffData.nextRoundDraftOrder || [];

        console.log(`🔥 Current playoff round: ${currentRound} (was ${previousRound})`);
        console.log(`🔥 Banked picks:`, bankedPicks);
        console.log(`🔥 Next round draft order:`, nextRoundDraftOrder);

        // Update UI to reflect current round
        if (roundDisplay) {
            roundDisplay.textContent = `Round ${currentRound}`;
        }
        if (currentRoundNumber) {
            currentRoundNumber.textContent = currentRound.toString();
        }

        // If the round has changed, reload player data for everyone
        if (previousRound !== currentRound) {
            console.log(`🔥 Round changed from ${previousRound} to ${currentRound}, reloading player data...`);
            allPlayers = [];
            loadPlayerData();
            showNotification(`Round ${currentRound} has started! Player stats updated.`, 5000);
        }

        updateBankedPicksDisplay();
    }, (error) => {
        console.error("Error reading playoff round data:", error);
    });

    // Listener 7: Online Presence
    const presenceRef = ref(database, `leagues/${leagueId}/presence/${currentUser.uid}`);
    const connectedRef = ref(database, '.info/connected');
    playerListeners.presence = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            set(presenceRef, { online: true, lastSeen: serverTimestamp() });
            onDisconnect(presenceRef).set({ online: false, lastSeen: serverTimestamp() });
            console.log("User presence set to online.");
        }
    });

    console.log("League listeners set up.");
    updateDraftOrderDisplay();
}

function cleanupListeners() {
    console.log("Cleaning up Firebase listeners...");
    Object.values(playerListeners).forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
    Object.values(chatListeners).forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
    playerListeners = {};
    chatListeners = {};

    if (draftStatusListener && leagueId) {
        const draftStatusRef = ref(database, `leagues/${leagueId}/draftStatus`);
        off(draftStatusRef, 'value', draftStatusListener);
        draftStatusListener = null;
    }
}

// --- Player Data Handling ---
function loadPlayerData() {
    if (allPlayers && allPlayers.length > 0) {
        console.log("Player data already loaded.");
        filterPlayers();
        return;
    }
    console.log("Loading player data...");
    if (playerTableBody) {
        playerTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center;"><div class="loader"></div></td></tr>`;
    }

    const dataSource = currentRound > 1 ? 'data/nhl_playoff_players.json' : 'data/nhl_players.json';
    console.log(`Loading player data from ${dataSource} (Round ${currentRound})`);

    fetch(dataSource)
        .then(response => {
            if (!response.ok && dataSource.includes('playoff')) {
                console.log("Playoff stats not available yet, falling back to regular season stats");
                return fetch('data/nhl_players.json');
            }
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (!Array.isArray(data)) throw new Error("Player data is not an array.");
            console.log(`Loaded ${data.length} players.`);
            allPlayers = data;
            filterPlayers();
        })
        .catch(error => {
            console.error('Error loading player data:', error);
            showNotification('Error loading NHL player data. Check console.', 7000);
            if (playerTableBody) {
                playerTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: red;">Failed to load player data. ${error.message}</td></tr>`;
            }
        });
}

// --- Filtering & Rendering Players ---
function filterPlayers() {
    if (!allPlayers || allPlayers.length === 0 || !playerTableBody) return;

    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
    const showDrafted = document.getElementById('showDrafted')?.checked || false;

    let filtered = allPlayers;

    // Apply position filter
    if (currentPositionFilter !== 'all') {
        filtered = filtered.filter(player => player.position === currentPositionFilter);
    }

    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(player => (player.fullName || '').toLowerCase().includes(searchTerm));
    }

    // Get drafted player IDs
    const draftedIdsSet = new Set(draftedPlayers.map(dp => dp.playerId?.toString()));

    // Filter out drafted unless 'Show Drafted' is checked
    if (!showDrafted) {
        filtered = filtered.filter(player => !draftedIdsSet.has(player.id?.toString()));
    }

    // Apply sorting
    if (currentSortColumn) {
        filtered.sort((a, b) => {
            let aValue = a[currentSortColumn];
            let bValue = b[currentSortColumn];
            const defaultStr = '';
            const defaultNum = -Infinity;

            if (typeof aValue === 'string' || typeof bValue === 'string') {
                aValue = (aValue ?? defaultStr).toString().toLowerCase();
                bValue = (bValue ?? defaultStr).toString().toLowerCase();
                return currentSortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
            } else {
                aValue = Number(aValue ?? defaultNum);
                bValue = Number(bValue ?? defaultNum);
                return currentSortDirection === 'asc' ? aValue - bValue : bValue - aValue;
            }
        });
    } else {
        filtered.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    }

    renderPlayerTable(filtered, draftedIdsSet);
}

function renderPlayerTable(playersToRender, draftedIdsSet) {
    if (!playerTableBody) return;
    playerTableBody.innerHTML = '';

    if (playersToRender.length === 0) {
        playerTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center;">No players match filters.</td></tr>`;
        return;
    }

    const draftIsActive = leagueData?.draftStatus?.active ?? false;
    const isMyTurn = draftIsActive && leagueData?.draftStatus?.currentDrafter === currentUser?.uid;
    const iCanDraftAnyPlayer = draftIsActive && (isMyTurn || (isCommissioner && commissionerModeActive));

    const fragment = document.createDocumentFragment();

    playersToRender.forEach(player => {
        const row = document.createElement('tr');
        const playerIdStr = player.id?.toString();
        const isDrafted = draftedIdsSet.has(playerIdStr);

        row.classList.toggle('drafted', isDrafted);

        const draftButtonEnabled = iCanDraftAnyPlayer && !isDrafted;

        const formatStat = (val) => (val == null || val === "" || val === 0) ? '-' : val;
        const position = player.position || 'N/A';
        const fullName = player.fullName || 'N/A';
        const team = player.teamAbbreviation || 'N/A';

        row.dataset.playerId = playerIdStr;
        row.dataset.playerName = fullName;
        row.dataset.playerPosition = position;
        row.dataset.playerTeam = team;

        row.innerHTML = `
            <td>${fullName}</td>
            <td>${position}</td>
            <td>${team}</td>
            <td class="hide-mobile">${formatStat(player.gamesPlayed)}</td>
            <td class="skater-stat">${position !== 'G' ? formatStat(player.goals) : '-'}</td>
            <td class="skater-stat">${position !== 'G' ? formatStat(player.assists) : '-'}</td>
            <td class="skater-stat">${position !== 'G' ? formatStat(player.points) : '-'}</td>
            <td class="goalie-stat hide-mobile">${position === 'G' ? formatStat(player.wins) : '-'}</td>
            <td class="goalie-stat hide-mobile">${position === 'G' ? formatStat(player.shutouts) : '-'}</td>
            <td>
                <button class="draft-button btn" ${draftButtonEnabled ? '' : 'disabled'}>
                    ${isDrafted ? 'Drafted' : 'Draft'}
                </button>
            </td>
        `;
        fragment.appendChild(row);
    });

    playerTableBody.appendChild(fragment);

    // Add event listeners AFTER appending
    playerTableBody.querySelectorAll('.draft-button:not([disabled])').forEach(button => {
        button.removeEventListener('click', handleDraftClick);
        button.addEventListener('click', handleDraftClick);
    });
}

function handleDraftClick(event) {
    const button = event.target;
    const row = button.closest('tr');
    if (!row) return;

    button.disabled = true;
    button.textContent = 'Drafting...';

    const playerId = row.dataset.playerId;
    const playerName = row.dataset.playerName;
    const position = row.dataset.playerPosition;
    const nhlTeam = row.dataset.playerTeam;

    console.log(`Draft button clicked for ${playerName} (ID: ${playerId})`);
    draftPlayer(playerId, playerName, position, nhlTeam);
}

// --- Drafting Logic ---
function draftPlayer(playerId, playerName, position, nhlTeam) {
    console.log(`Attempting draft for ${playerName}`);
    const draftIsActive = leagueData?.draftStatus?.active ?? false;
    if (!draftIsActive) {
        showNotification("The draft is not currently active.");
        filterPlayers();
        return;
    }
    if (!currentUser) {
        showNotification("You must be logged in to draft.");
        filterPlayers();
        return;
    }

    const currentDrafterUid = leagueData.draftStatus.currentDrafter;
    const isMyTurn = currentDrafterUid === currentUser.uid;
    const commissionerDrafting = isCommissioner && commissionerModeActive;

    let teamUidToAssign = null;
    if (isMyTurn || commissionerDrafting) {
        teamUidToAssign = currentDrafterUid;
    } else {
        showNotification("It's not your turn to draft.");
        filterPlayers();
        return;
    }

    const teamNameToAssign = currentTeams[teamUidToAssign]?.name;
    const drafterDisplayName = currentUser.displayName;

    if (!teamNameToAssign) {
        console.error(`Cannot assign player: Team name not found for UID ${teamUidToAssign}`);
        showNotification(`Error: Could not find team name for the current pick.`);
        filterPlayers();
        return;
    }

    // Check again if player already drafted (race condition mitigation)
    const latestDraftedIds = new Set(draftedPlayers.map(dp => dp.playerId?.toString()));
    if (latestDraftedIds.has(playerId?.toString())) {
        showNotification(`${playerName} has already been drafted.`);
        filterPlayers();
        return;
    }

    const currentRoundDraft = leagueData.draftStatus.round ?? 1;
    const currentPickNumber = leagueData.draftStatus.pickNumber ?? 1;

    const draftedPlayerRecord = {
        playerId: playerId,
        Player: playerName,
        Position: position,
        "NHL Team": nhlTeam,
        Team: teamNameToAssign,
        teamUid: teamUidToAssign,
        draftedByUid: currentUser.uid,
        draftedByName: drafterDisplayName,
        draftedAt: serverTimestamp(),
        round: currentRoundDraft,
        pickNumber: currentPickNumber,
        playoffRoundDrafted: currentRound
    };

    disableAllDraftButtons();

    const draftedPlayersRef = ref(database, `leagues/${leagueId}/draftedPlayers`);
    const newPlayerRef = push(draftedPlayersRef);

    set(newPlayerRef, draftedPlayerRecord).then(() => {
        console.log(`${playerName} successfully drafted for ${teamNameToAssign}.`);
        showNotification(`${playerName} drafted! (Pick ${currentPickNumber})`);

        let chatMessageText;
        if (!isMyTurn && commissionerDrafting) {
            chatMessageText = `${drafterDisplayName} (Commish) drafted ${playerName} for ${teamNameToAssign} (Pick ${currentPickNumber})`;
        } else {
            chatMessageText = `${teamNameToAssign} drafted ${playerName} (${position}, ${nhlTeam}) (Pick ${currentPickNumber})`;
        }
        addChatMessage({ type: 'system', text: chatMessageText, timestamp: serverTimestamp() });

        moveToNextDrafter();

    }).catch((error) => {
        console.error(`Error drafting player ${playerName}:`, error);
        showNotification(`Error drafting player: ${error.message}`, 7000);
        filterPlayers();
    });
}

function disableAllDraftButtons() {
    if (playerTableBody) {
        playerTableBody.querySelectorAll('.draft-button').forEach(btn => {
            if (!btn.disabled) {
                btn.disabled = true;
            }
        });
    }
}

function moveToNextDrafter() {
    if (!leagueData?.draftStatus?.draftOrder || !leagueData.draftStatus.currentDrafter) {
        console.error("Cannot move to next drafter: Missing draft status data.");
        showNotification("Error: Could not determine next drafter.", 7000);
        return;
    }

    const { draftOrder, currentDrafter, round, pickNumber } = leagueData.draftStatus;
    const currentIndex = draftOrder.indexOf(currentDrafter);
    const numTeams = draftOrder.length;

    if (currentIndex === -1) {
        console.error("Critical Error: Current drafter not found in order!");
        showNotification("Error: Draft order corrupted. Draft paused.", 10000);
        return;
    }

    let nextIndex;
    let nextRound = round;
    let nextPickNumber = (pickNumber || 0) + 1;

    const isEvenRound = round % 2 === 0;

    if (isEvenRound) {
        nextIndex = currentIndex - 1;
        if (nextIndex < 0) {
            nextIndex = 0;
            nextRound++;
        }
    } else {
        nextIndex = currentIndex + 1;
        if (nextIndex >= numTeams) {
            nextIndex = numTeams - 1;
            nextRound++;
        }
    }

    const nextDrafterUid = draftOrder[nextIndex];

    const draftStatusRef = ref(database, `leagues/${leagueId}/draftStatus`);
    update(draftStatusRef, {
        currentDrafter: nextDrafterUid,
        round: nextRound,
        pickNumber: nextPickNumber
    }).then(() => {
        console.log("Draft status updated for next turn.");
        if (nextDrafterUid === currentUser?.uid) {
            showNotification("It's your turn to draft!", 7000);
        }
    }).catch((error) => {
        console.error("Error updating draft status for next turn:", error);
        showNotification(`Error advancing draft turn: ${error.message}`, 7000);
        filterPlayers();
    });
}

// Filter and display the DRAFTED players list
function filterDraftedPlayers() {
    if (!draftedTableBody) return;
    const teamFilter = draftedTeamFilter?.value || 'all';
    draftedTableBody.innerHTML = '';

    let filtered = draftedPlayers;
    if (teamFilter !== 'all') {
        filtered = filtered.filter(player => player.teamUid === teamFilter);
    }

    const fragment = document.createDocumentFragment();

    if (filtered.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" style="text-align: center;">${teamFilter === 'all' ? 'No players drafted yet.' : 'No players drafted for this team yet.'}</td>`;
        fragment.appendChild(row);
    } else {
        const lastDraftedPlayer = draftedPlayers.length > 0 ? draftedPlayers[draftedPlayers.length - 1] : null;
        const lastDraftedPlayerKey = lastDraftedPlayer?.firebaseKey;

        filtered.forEach((player) => {
            const row = document.createElement('tr');
            const isOverallLastPick = player.firebaseKey === lastDraftedPlayerKey;
            const canUndo = isCommissioner && isOverallLastPick;
            const draftRound = player.round || 1;

            row.innerHTML = `
                <td style="width: 5%; text-align: center;">${player.draftNumber || '-'}</td>
                <td>${player.Player || 'N/A'}</td>
                <td>${player.Position || 'N/A'}</td>
                <td class="hide-mobile">${player["NHL Team"] || 'N/A'}</td>
                <td>${player.Team || 'N/A'}<span class="round-indicator" style="font-size: 0.7em; padding: 1px 4px;">R${draftRound}</span></td>
                <td>
                    ${canUndo ? `<button class="undo-button btn danger" data-key="${player.firebaseKey}">Undo Pick</button>` : ''}
                </td>
            `;
            fragment.appendChild(row);
        });
    }
    draftedTableBody.appendChild(fragment);

    // Add event listeners to undo buttons
    draftedTableBody.querySelectorAll('.undo-button').forEach(button => {
        button.removeEventListener('click', handleUndoClick);
        button.addEventListener('click', handleUndoClick);
    });
}

function handleUndoClick(event) {
    const button = event.target;
    const key = button.dataset.key;
    const row = button.closest('tr');
    if (!key || !row) return;

    const pickNumber = parseInt(row.cells[0].textContent) || 0;
    const playerName = row.cells[1].textContent;

    const playerData = draftedPlayers.find(p => p.firebaseKey === key);
    if (!playerData) {
        console.error("Could not find player data for key:", key);
        showNotification("Error: Could not find player data");
        return;
    }

    undoLastDraftPick(
        key,
        playerName,
        pickNumber,
        playerData.round || 1,
        playerData.teamUid,
        playerData.Team
    );
}

function undoLastDraftPick(firebaseKey, playerNameForMessage, pickNumberToUndo, roundToRestore, teamUidToRestore, teamNameToRestore) {
    if (!isCommissioner) {
        showNotification("Only the commissioner can undo draft picks.");
        return;
    }

    if (!firebaseKey) {
        console.error("Cannot undo pick: Missing Firebase key");
        showNotification("Error: Cannot undo pick due to missing data.");
        return;
    }

    pickNumberToUndo = parseInt(pickNumberToUndo) || 0;
    roundToRestore = parseInt(roundToRestore) || 1;

    const actualLastPickNumber = draftedPlayers.length;
    if (pickNumberToUndo !== actualLastPickNumber) {
        showNotification(`Cannot undo pick #${pickNumberToUndo}. Only the very last pick (#${actualLastPickNumber}) can be undone.`);
        return;
    }

    const name = playerNameForMessage || 'last player';
    const teamName = teamNameToRestore || 'the previous team';

    if (!confirm(`Are you sure you want to UNDO the last pick (#${pickNumberToUndo} - ${name} by ${teamName})?`)) {
        return;
    }

    const updates = {};
    updates[`leagues/${leagueId}/draftedPlayers/${firebaseKey}`] = null;
    updates[`leagues/${leagueId}/draftStatus/currentDrafter`] = teamUidToRestore;
    updates[`leagues/${leagueId}/draftStatus/pickNumber`] = pickNumberToUndo;
    updates[`leagues/${leagueId}/draftStatus/round`] = roundToRestore;

    const dbRef = ref(database);
    update(dbRef, updates).then(() => {
        console.log(`Pick #${pickNumberToUndo} (${name}) undone successfully.`);
        showNotification(`Pick #${pickNumberToUndo} (${name}) undone. It's now ${teamName}'s turn.`);
        addChatMessage({
            type: 'system',
            text: `${currentUser.displayName} (Commish) undid the last pick (#${pickNumberToUndo} - ${name}).`,
            timestamp: serverTimestamp()
        });
    }).catch(error => {
        console.error(`Error undoing pick #${pickNumberToUndo}:`, error);
        showNotification(`Error undoing pick: ${error.message}`, 7000);
    });
}

// --- Draft Control (Start) ---
function startDraft() {
    if (!isCommissioner) {
        showNotification("Only the commissioner can start the draft.");
        return;
    }

    const teamUids = Object.keys(currentTeams || {});
    if (teamUids.length < 2) {
        showNotification("Need at least 2 teams to start a draft.");
        return;
    }

    if (!confirm(`Start the draft for "${leagueData?.name ?? 'this league'}"? Draft order will be randomized.`)) {
        return;
    }

    let draftOrder = [...teamUids];

    // Enhanced Fisher-Yates shuffle
    for (let shuffle = 0; shuffle < 3; shuffle++) {
        for (let i = draftOrder.length - 1; i > 0; i--) {
            const randomSeed = Math.random() * Date.now() % 10000;
            const j = Math.floor(randomSeed % (i + 1));
            [draftOrder[i], draftOrder[j]] = [draftOrder[j], draftOrder[i]];
        }
    }

    const initialDraftStatus = {
        active: true,
        startedAt: serverTimestamp(),
        startedByUid: currentUser.uid,
        draftOrder: draftOrder,
        currentDrafter: draftOrder[0],
        round: 1,
        pickNumber: 1,
        snakeDraft: true
    };

    const playoffRoundData = {
        currentRound: 1,
        bankedPicks: {},
        nextRoundDraftOrder: []
    };

    const updates = {};
    updates[`leagues/${leagueId}/draftStatus`] = initialDraftStatus;
    updates[`leagues/${leagueId}/playoffRound`] = playoffRoundData;

    const dbRef = ref(database);
    update(dbRef, updates).then(() => {
        console.log("Draft status set, draft started.");
        const firstDrafterName = currentTeams[draftOrder[0]]?.name ?? 'First Pick';
        const startMessage = `Draft started by ${currentUser.displayName}! ${firstDrafterName} is up first.`;
        addChatMessage({ type: 'system', text: startMessage, timestamp: serverTimestamp() });
        showNotification("Round 1 started!");

        allPlayers = [];
        loadPlayerData();
    }).catch((error) => {
        console.error("Error starting draft:", error);
        showNotification(`Error starting draft: ${error.message}`, 7000);
    });
}

// --- Event Listeners for Filters & Sorting ---
function setupEventListeners() {
    document.querySelectorAll('.position-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.position-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPositionFilter = btn.dataset.position;
            filterPlayers();
        });
    });

    document.querySelectorAll('th[data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            const columnKey = header.dataset.sort;
            const table = header.closest('table');
            if (!table || !columnKey) return;

            const isPlayerTable = table.id === 'playerTable';
            let sortDirection;

            if (header.classList.contains('sorted-asc')) {
                sortDirection = 'desc';
            } else {
                sortDirection = 'asc';
            }

            table.querySelectorAll('th[data-sort]').forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
            header.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');

            if (isPlayerTable) {
                currentSortColumn = columnKey;
                currentSortDirection = sortDirection;
                filterPlayers();
            } else {
                sortAndRenderDraftedTable(columnKey, sortDirection);
            }
        });
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterPlayers);
    }

    const showDraftedCheckbox = document.getElementById('showDrafted');
    if (showDraftedCheckbox) {
        showDraftedCheckbox.addEventListener('change', filterPlayers);
    }

    const refreshBtn = document.getElementById('refresh-players-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            allPlayers = [];
            if (playerTableBody) {
                playerTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center;"><div class="loader"></div></td></tr>`;
            }
            showNotification("Refreshing player data...");
            loadPlayerData();
        });
    }
}

function sortAndRenderDraftedTable(columnKey, direction) {
    draftedPlayers.sort((a, b) => {
        let aValue = a[columnKey];
        let bValue = b[columnKey];
        const defaultStr = '';
        const isNumericSort = columnKey === 'draftNumber';
        const defaultNum = direction === 'asc' ? Infinity : -Infinity;

        if (isNumericSort) {
            aValue = Number(aValue ?? defaultNum);
            bValue = Number(bValue ?? defaultNum);
            return direction === 'asc' ? aValue - bValue : bValue - aValue;
        } else {
            aValue = (aValue ?? defaultStr).toString().toLowerCase();
            bValue = (bValue ?? defaultStr).toString().toLowerCase();
            return direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
    });
    filterDraftedPlayers();
}

// --- Chat Functionality ---
function setupChat() {
    if (!chatContainer || !chatHeader || !chatToggle || !chatSend || !chatInput) return;
    
    chatHeader.addEventListener('click', (e) => { 
        if (e.target !== chatToggle) toggleChatWindow(); 
    });
    chatToggle.addEventListener('click', toggleChatWindow);
    chatSend.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            sendChatMessage(); 
        } 
    });
}

function toggleChatWindow() {
    const isMinimized = chatContainer.classList.toggle('minimized');
    chatToggle.textContent = isMinimized ? '+' : '−';
    if (!isMinimized) scrollToChatBottom(true);
}

function sendChatMessage() {
    const messageText = chatInput.value.trim();
    if (!messageText || !currentUser || !leagueId) return;

    addChatMessage({
        type: 'user',
        uid: currentUser.uid,
        name: currentTeams[currentUser.uid]?.name || currentUser.displayName || 'User',
        photoURL: currentTeams[currentUser.uid]?.photoURL || currentUser.photoURL || null,
        text: messageText,
        timestamp: serverTimestamp()
    });
    chatInput.value = '';
}

function addChatMessage(messageObject) {
    if (!leagueId) return;
    const chatRef = ref(database, `leagues/${leagueId}/chat`);
    push(chatRef, messageObject).catch(error => {
        console.error("Error sending chat message:", error);
        showNotification(`Error sending message: ${error.message}`, 7000);
    });
}

function updateChatMessages(messagesObject) {
    if (!chatMessages) return;
    const shouldScroll = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 50;
    chatMessages.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const sortedKeys = Object.keys(messagesObject).sort((keyA, keyB) =>
        (messagesObject[keyA]?.timestamp ?? 0) - (messagesObject[keyB]?.timestamp ?? 0)
    );

    sortedKeys.forEach(key => {
        const message = messagesObject[key];
        if (!message || !message.text) return;

        const messageEl = document.createElement('div');
        const sanitize = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (message.type === 'system') {
            messageEl.className = 'chat-system';
            messageEl.textContent = sanitize(message.text);
        } else {
            messageEl.className = 'chat-message';
            const timeStr = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], {
                hour: 'numeric', minute: '2-digit'
            }) : '';

            const safeName = sanitize(message.name || 'User');
            const safeText = sanitize(message.text);
            const avatarImg = message.photoURL
                ? `<img src="${sanitize(message.photoURL)}" alt="" class="user-avatar">`
                : `<span class="user-avatar" style="background-color: ${getUserColor(message.uid)};"></span>`;

            messageEl.innerHTML = `
                <div class="chat-user">
                    ${avatarImg}
                    <strong>${safeName}</strong>
                    <span class="chat-time">${timeStr}</span>
                </div>
                <div class="chat-text">${safeText.replace(/\n/g, '<br>')}</div>
            `;
        }
        fragment.appendChild(messageEl);
    });
    chatMessages.appendChild(fragment);
    if (shouldScroll) scrollToChatBottom(true);
}

function getUserColor(uid) {
    let hash = 0;
    for (let i = 0; i < (uid?.length || 0); i++) {
        hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
}

function scrollToChatBottom(force = false) {
    if (!chatMessages) return;
    const scrollTolerance = 50;
    if (force || chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + scrollTolerance) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// --- Helper Functions ---
function populateTeamFilter() {
    if (!draftedTeamFilter) return;
    
    const currentFilterValue = draftedTeamFilter.value;
    draftedTeamFilter.innerHTML = '<option value="all">All Teams</option>';

    if (currentTeams && Object.keys(currentTeams).length > 0) {
        const sortedTeamEntries = Object.entries(currentTeams)
            .sort(([, teamA], [, teamB]) => (teamA.name || '').localeCompare(teamB.name || ''));

        sortedTeamEntries.forEach(([uid, team]) => {
            const option = document.createElement('option');
            option.value = uid;
            option.textContent = team.name || `Unnamed Team (${uid.substring(0, 4)})`;
            if (team.name) {
                draftedTeamFilter.appendChild(option);
            }
        });
    }

    const optionExists = [...draftedTeamFilter.options].some(opt => opt.value === currentFilterValue);
    if (optionExists) {
        draftedTeamFilter.value = currentFilterValue;
    } else if (currentUser && currentTeams[currentUser.uid]) {
        draftedTeamFilter.value = currentUser.uid;
    } else {
        draftedTeamFilter.value = 'all';
    }

    if (draftedTeamFilter.selectedIndex === -1) {
        draftedTeamFilter.value = 'all';
    }

    filterDraftedPlayers();
}

function updateDraftOrderDisplay() {
    const draftOrderDisplay = document.getElementById('draft-order-display');
    if (!draftOrderDisplay) return;

    draftOrderDisplay.innerHTML = '';

    if (!leagueData || !leagueData.draftStatus || !leagueData.draftStatus.draftOrder) {
        draftOrderDisplay.innerHTML = '<div class="empty-message">Draft order not set yet</div>';
        return;
    }

    const draftOrder = leagueData.draftStatus.draftOrder || [];
    const currentRoundDraft = leagueData.draftStatus.round || 1;
    const currentDrafterUid = leagueData.draftStatus.currentDrafter;
    const isEvenRound = currentRoundDraft % 2 === 0;

    const directionLabel = document.createElement('div');
    directionLabel.className = 'draft-direction-label';
    directionLabel.innerHTML = `Round ${currentRoundDraft}: ${isEvenRound ? '← Reverse Order' : '→ Normal Order'}`;
    draftOrderDisplay.appendChild(directionLabel);

    const orderContainer = document.createElement('div');
    orderContainer.className = 'draft-order-items';
    draftOrderDisplay.appendChild(orderContainer);

    draftOrder.forEach((teamUid, index) => {
        const team = currentTeams[teamUid];
        if (!team) return;

        const orderItem = document.createElement('div');
        orderItem.className = 'draft-order-item';

        const currentIndex = draftOrder.indexOf(currentDrafterUid);
        if (index === currentIndex) {
            orderItem.classList.add('current');
        }

        if (teamUid === currentUser?.uid) {
            orderItem.style.borderColor = '#4caf50';
            orderItem.style.borderWidth = '2px';
        }

        const teamBankedPicks = bankedPicks[teamUid] || 0;
        const bankedPicksIndicator = teamBankedPicks > 0
            ? `<span class="banked-pick-indicator">${teamBankedPicks} Banked</span>`
            : '';

        let roundPositions = '';
        for (let r = 1; r <= 4; r++) {
            let positionInRound = r % 2 === 0
                ? draftOrder.length - index
                : index + 1;

            roundPositions += `<span class="round-position ${r === currentRoundDraft ? 'current-round' : ''}">R${r}: #${positionInRound}</span>`;
        }

        orderItem.innerHTML = `
            <span class="draft-order-number">${index + 1}</span>
            <div class="draft-order-details">
                <span class="draft-order-name">${team.name}</span>
                <div class="draft-order-positions">${roundPositions}</div>
            </div>
            ${bankedPicksIndicator}
        `;

        orderContainer.appendChild(orderItem);
    });

    if (draftOrder.length === 0) {
        orderContainer.innerHTML = '<div class="empty-message">Draft order not set yet</div>';
    }
}

function showNotification(message, duration = 5000) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        opacity: 1;
        transition: opacity 0.5s;
    `;
    document.body.appendChild(notification);
    console.log(`Notify: ${message}`);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, duration - 500);
}

// --- DOM Ready ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Ready for Draft Centre.");
    
    if (!initializeDOM()) {
        console.error('Failed to initialize DOM elements');
        return;
    }

    // Set up auth event listeners
    loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider).catch(error => {
            console.error("Auth error:", error);
            authStatus.textContent = `Error: ${error.message}`;
            showNotification(`Sign-in Error: ${error.message}`, 7000);
        });
    });

    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.reload();
        }).catch(error => {
            console.error("Sign out error:", error);
            showNotification(`Sign-out Error: ${error.message}`, 7000);
        });
    });

    // Set up other event listeners
    setupEventListeners();
    setupChat();

    // Set up team filter change listener
    if (draftedTeamFilter) {
        draftedTeamFilter.addEventListener('change', filterDraftedPlayers);
    }

    // Bank pick button event listener
    if (bankPickBtn) {
        bankPickBtn.addEventListener('click', handleBankPick);
    }

    console.log("Draft Centre initialized successfully.");
});

// --- Undo Functions ---
function undoLastDraftPick(firebaseKey, playerNameForMessage, pickNumberToUndo, roundToRestore, teamUidToRestore, teamNameToRestore) {
    if (!isCommissioner) {
        showNotification("Only the commissioner can undo draft picks.");
        return;
    }

    if (!firebaseKey) {
        console.error("Cannot undo pick: Missing Firebase key");
        showNotification("Error: Cannot undo pick due to missing data.");
        return;
    }

    pickNumberToUndo = parseInt(pickNumberToUndo) || 0;
    roundToRestore = parseInt(roundToRestore) || 1;

    const actualLastPickNumber = draftedPlayers.length;
    if (pickNumberToUndo !== actualLastPickNumber) {
        showNotification(`Cannot undo pick #${pickNumberToUndo}. Only the very last pick (#${actualLastPickNumber}) can be undone.`);
        return;
    }

    const name = playerNameForMessage || 'last player';
    const teamName = teamNameToRestore || 'the previous team';

    if (!confirm(`Are you sure you want to UNDO the last pick (#${pickNumberToUndo} - ${name} by ${teamName})?`)) {
        return;
    }

    const updates = {};
    updates[`leagues/${leagueId}/draftedPlayers/${firebaseKey}`] = null;
    updates[`leagues/${leagueId}/draftStatus/currentDrafter`] = teamUidToRestore;
    updates[`leagues/${leagueId}/draftStatus/pickNumber`] = pickNumberToUndo;
    updates[`leagues/${leagueId}/draftStatus/round`] = roundToRestore;

    const dbRef = ref(database);
    update(dbRef, updates).then(() => {
        console.log(`Pick #${pickNumberToUndo} (${name}) undone successfully.`);
        showNotification(`Pick #${pickNumberToUndo} (${name}) undone. It's now ${teamName}'s turn.`);
        addChatMessage({
            type: 'system',
            text: `${currentUser.displayName} (Commish) undid the last pick (#${pickNumberToUndo} - ${name}).`,
            timestamp: serverTimestamp()
        });
    }).catch(error => {
        console.error(`Error undoing pick #${pickNumberToUndo}:`, error);
        showNotification(`Error undoing pick: ${error.message}`, 7000);
    });
}

// --- Banking Pick Functions ---
function handleBankPick() {
    if (currentRound <= 1) {
        showNotification("Banking picks is only available after the first round.");
        return;
    }

    const currentDrafterUid = leagueData?.draftStatus?.currentDrafter;

    if (currentDrafterUid !== currentUser.uid && !commissionerModeActive) {
        showNotification("You can only bank picks during your turn.");
        return;
    }

    if (!confirm("Are you sure you want to bank this pick for a future round? You will skip this pick and gain an extra pick in a later round.")) {
        return;
    }

    bankPickBtn.disabled = true;

    const teamUid = currentDrafterUid;
    const currentBankedPicks = bankedPicks[teamUid] || 0;
    const drafterTeamName = currentTeams[teamUid]?.name || "Unknown Team";

    const bankedPickRecord = {
        isBankedPick: true,
        teamUid: teamUid,
        Team: drafterTeamName,
        Player: "BANKED PICK",
        Position: "-",
        "NHL Team": "-",
        draftedByUid: currentUser.uid,
        draftedByName: currentUser.displayName,
        draftedAt: serverTimestamp(),
        round: currentRound,
        pickNumber: leagueData.draftStatus.pickNumber || 1
    };

    const updates = {};
    updates[`leagues/${leagueId}/playoffRound/bankedPicks/${teamUid}`] = currentBankedPicks + 1;

    const draftedPlayersRef = ref(database, `leagues/${leagueId}/draftedPlayers`);
    const newBankedPickRef = push(draftedPlayersRef);

    set(newBankedPickRef, bankedPickRecord)
        .then(() => {
            return update(ref(database), updates);
        })
        .then(() => {
            console.log(`Pick banked for team ${drafterTeamName}`);
            showNotification(`Pick banked for future round`);
            
            addChatMessage({
                type: 'system',
                text: `${drafterTeamName} banked their pick for a future round.`,
                timestamp: serverTimestamp()
            });

            moveToNextDrafter();
            bankPickBtn.disabled = false;
        })
        .catch((error) => {
            console.error("Error banking pick:", error);
            showNotification(`Error banking pick: ${error.message}`, 7000);
            bankPickBtn.disabled = false;
        });
}

// --- Playoff Round Management Functions ---
function handleConcludeRound() {
    console.log("🔥 CONCLUDE ROUND CLICKED - Debug Info:");
    console.log("- isCommissioner:", isCommissioner);
    console.log("- currentRound:", currentRound);
    console.log("- leagueData:", leagueData);
    console.log("- draftStatus:", leagueData?.draftStatus);
    
    if (!isCommissioner) {
        console.log("❌ Not commissioner");
        showNotification("Only the commissioner can conclude rounds.");
        return;
    }

    if (!leagueData?.draftStatus?.active) {
        console.log("❌ Draft not active, draftStatus:", leagueData?.draftStatus);
        showNotification("Cannot conclude round: Draft is not active.");
        return;
    }

    const draftOrder = leagueData?.draftStatus?.draftOrder || [];
    const currentPickIndex = (leagueData?.draftStatus?.pickNumber || 1) - 1;
    
    console.log("- draftOrder length:", draftOrder.length);
    console.log("- currentPickIndex:", currentPickIndex);
    console.log("- pickNumber:", leagueData?.draftStatus?.pickNumber);

    if (currentPickIndex < draftOrder.length) {
        const remainingPicks = draftOrder.length - currentPickIndex;
        console.log("❌ Picks remaining:", remainingPicks);
        showNotification(`Cannot conclude round: There are still ${remainingPicks} picks remaining.`, 7000);
        return;
    }

    console.log("✅ Validation passed, asking for confirmation");
    if (!confirm(`Are you sure you want to conclude Round ${currentRound}? This will pause the draft and allow you to set up the next round.`)) {
        console.log("❌ User cancelled");
        return;
    }
    
    console.log("✅ User confirmed, proceeding with conclude round");

    const draftStatusRef = ref(database, `leagues/${leagueId}/draftStatus`);
    update(draftStatusRef, { active: false })
        .then(() => {
            console.log(`Round ${currentRound} concluded.`);
            showNotification(`Round ${currentRound} concluded. Set up the next round.`);

            if (draftOrderManager) {
                draftOrderManager.classList.remove('hidden');
                populateDraftOrderManager();
            }

            addChatMessage({
                type: 'system',
                text: `Round ${currentRound} concluded by commissioner. Preparing for Round ${currentRound + 1}.`,
                timestamp: serverTimestamp()
            });
        })
        .catch((error) => {
            console.error("Error concluding round:", error);
            showNotification(`Error concluding round: ${error.message}`, 7000);
        });
}

function populateDraftOrderManager() {
    if (!draftOrderList || !bankedPicksList) return;

    draftOrderList.innerHTML = '';
    bankedPicksList.innerHTML = '';

    const teamsWithBanks = Object.entries(currentTeams).map(([uid, team]) => ({
        uid,
        name: team.name,
        bankedPicks: bankedPicks[uid] || 0
    }));

    teamsWithBanks.sort((a, b) => a.name.localeCompare(b.name));

    teamsWithBanks.forEach(team => {
        const teamItem = document.createElement('div');
        teamItem.className = 'draft-team-item';
        teamItem.dataset.uid = team.uid;
        teamItem.dataset.pickType = 'standard';
        teamItem.draggable = true;

        teamItem.innerHTML = `
            <div class="draft-team-name">${team.name}</div>
            <div class="draft-team-pick-type">Standard Pick</div>
        `;

        draftOrderList.appendChild(teamItem);
    });

    const teamsWithBankedPicks = teamsWithBanks.filter(team => team.bankedPicks > 0);

    if (teamsWithBankedPicks.length === 0) {
        bankedPicksList.innerHTML = '<div class="empty-message">No banked picks yet</div>';
    } else {
        teamsWithBankedPicks.forEach(team => {
            for (let i = 0; i < team.bankedPicks; i++) {
                const pickItem = document.createElement('div');
                pickItem.className = 'draft-team-item banked-pick-item';
                pickItem.dataset.uid = team.uid;
                pickItem.dataset.pickType = 'banked';
                pickItem.draggable = true;

                pickItem.innerHTML = `
                    <div class="draft-team-name">${team.name}</div>
                    <div class="draft-team-pick-type">Banked Pick ${i + 1}</div>
                `;

                bankedPicksList.appendChild(pickItem);
            }
        });
    }

    updateNextRoundDraftOrder();
}

function updateNextRoundDraftOrder() {
    nextRoundDraftOrder = Array.from(draftOrderList.querySelectorAll('.draft-team-item'))
        .map(item => ({
            uid: item.dataset.uid,
            pickType: item.dataset.pickType
        }));
}

function handleSaveDraftOrder() {
    if (!isCommissioner) {
        showNotification("Only the commissioner can save the draft order.");
        return;
    }

    const nextRound = currentRound + 1;
    const confirmMessage = `Are you sure you want to save this draft order and start Round ${nextRound}?`;

    if (!confirm(confirmMessage)) {
        return;
    }

    const fullDraftOrder = [];
    const teamItems = Array.from(draftOrderList.querySelectorAll('.draft-team-item'));

    teamItems.forEach(item => {
        const uid = item.dataset.uid;
        fullDraftOrder.push(uid);
    });

    const teamCount = Object.keys(currentTeams).length;
    if (fullDraftOrder.length < teamCount) {
        const missingPicks = teamCount - fullDraftOrder.length;
        if (!confirm(`Warning: You have ${missingPicks} fewer picks than expected. Continue anyway?`)) {
            return;
        }
    }

    const updates = {};
    updates[`leagues/${leagueId}/playoffRound/currentRound`] = currentRound + 1;
    updates[`leagues/${leagueId}/playoffRound/nextRoundDraftOrder`] = nextRoundDraftOrder;

    const resetBankedPicks = {};
    Object.keys(bankedPicks).forEach(uid => {
        resetBankedPicks[uid] = 0;
    });
    updates[`leagues/${leagueId}/playoffRound/bankedPicks`] = resetBankedPicks;

    updates[`leagues/${leagueId}/draftStatus/active`] = true;
    updates[`leagues/${leagueId}/draftStatus/round`] = 1;
    updates[`leagues/${leagueId}/draftStatus/pickNumber`] = 1;
    updates[`leagues/${leagueId}/draftStatus/draftOrder`] = fullDraftOrder;
    updates[`leagues/${leagueId}/draftStatus/currentDrafter`] = fullDraftOrder[0];

    const dbRef = ref(database);
    update(dbRef, updates)
        .then(() => {
            console.log(`Round ${currentRound + 1} started with new draft order.`);
            showNotification(`Round ${currentRound + 1} started!`);

            if (draftOrderManager) {
                draftOrderManager.classList.add('hidden');
            }

            addChatMessage({
                type: 'system',
                text: `Round ${currentRound + 1} started by commissioner. Draft is now active.`,
                timestamp: serverTimestamp()
            });

            allPlayers = [];
            loadPlayerData();
        })
        .catch((error) => {
            console.error("Error saving draft order:", error);
            showNotification(`Error saving draft order: ${error.message}`, 7000);
        });
}

function handleCancelDraftOrder() {
    if (draftOrderManager) {
        draftOrderManager.classList.add('hidden');
    }
}

// --- Helper Functions ---
function updateBankedPicksDisplay() {
    if (!bankedPicks || !currentUser) return;

    const myBankedPicks = bankedPicks[currentUser.uid] || 0;
    const currentDrafterUid = leagueData?.draftStatus?.currentDrafter;

    if (currentDrafterUid === currentUser.uid) {
        if (myBankedPicks > 0) {
            bankedPicksInfo.classList.remove('hidden');
            currentTeamBankedPicks.textContent = myBankedPicks;
        } else {
            bankedPicksInfo.classList.add('hidden');
        }
        bankPickBtn.classList.remove('hidden');
    } else {
        bankedPicksInfo.classList.add('hidden');
        bankPickBtn.classList.add('hidden');
    }
}

function updateDraftOrderDisplay() {
    const draftOrderDisplay = document.getElementById('draft-order-display');
    if (!draftOrderDisplay) return;
    
    draftOrderDisplay.innerHTML = '';
    
    if (!leagueData || !leagueData.draftStatus || !leagueData.draftStatus.draftOrder) {
        draftOrderDisplay.innerHTML = '<div class="empty-message">Draft order not set yet</div>';
        return;
    }
    
    const draftOrder = leagueData.draftStatus.draftOrder || [];
    const currentRoundDraft = leagueData.draftStatus.round || 1;
    const currentDrafterUid = leagueData.draftStatus.currentDrafter;
    const isEvenRound = currentRoundDraft % 2 === 0;
    
    const directionLabel = document.createElement('div');
    directionLabel.className = 'draft-direction-label';
    directionLabel.innerHTML = `Round ${currentRound}: ${isEvenRound ? '← Reverse Order' : '→ Normal Order'}`;
    draftOrderDisplay.appendChild(directionLabel);
    
    const orderContainer = document.createElement('div');
    orderContainer.className = 'draft-order-items';
    draftOrderDisplay.appendChild(orderContainer);
    
    draftOrder.forEach((teamUid, index) => {
        const team = currentTeams[teamUid];
        if (!team) return;
        
        const orderItem = document.createElement('div');
        orderItem.className = 'draft-order-item';
        
        const currentIndex = draftOrder.indexOf(currentDrafterUid);
        if (index === currentIndex) {
            orderItem.classList.add('current');
        }
        
        if (teamUid === currentUser?.uid) {
            orderItem.style.borderColor = '#4caf50';
            orderItem.style.borderWidth = '2px';
        }
        
        const teamBankedPicks = bankedPicks[teamUid] || 0;
        const bankedPicksIndicator = teamBankedPicks > 0 
            ? `<span class="banked-pick-indicator">${teamBankedPicks} Banked</span>` 
            : '';
        
        let roundPositions = '';
        for (let r = 1; r <= 4; r++) {
            let positionInRound = r % 2 === 0 
                ? draftOrder.length - index  
                : index + 1;                 
            
            roundPositions += `<span class="round-position ${r === currentRound ? 'current-round' : ''}">R${r}: #${positionInRound}</span>`;
        }
        
        orderItem.innerHTML = `
            <span class="draft-order-number">${index + 1}</span>
            <div class="draft-order-details">
                <span class="draft-order-name">${team.name}</span>
                <div class="draft-order-positions">${roundPositions}</div>
            </div>
            ${bankedPicksIndicator}
        `;
        
        orderContainer.appendChild(orderItem);
    });
    
    if (draftOrder.length === 0) {
        orderContainer.innerHTML = '<div class="empty-message">Draft order not set yet</div>';
    }
}

// Make functions globally accessible for inline HTML calls
window.filterPlayers = filterPlayers;
window.filterDraftedPlayers = filterDraftedPlayers;