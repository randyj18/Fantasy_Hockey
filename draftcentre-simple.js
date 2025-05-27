// Simple working draftcentre based on manage-leagues pattern
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Initialize Firebase
const app = initializeApp(window.firebaseConfig || {
    apiKey: "PLACEHOLDER",
    authDomain: "playofffantasyhockey.firebaseapp.com",
    databaseURL: "https://playofffantasyhockey-default-rtdb.firebaseio.com",
    projectId: "playofffantasyhockey",
    storageBucket: "playofffantasyhockey.appspot.com",
    messagingSenderId: "PLACEHOLDER",
    appId: "PLACEHOLDER"
});

const auth = getAuth();
const provider = new GoogleAuthProvider();
const database = getDatabase();

// Global variables
let currentUser = null;
let leagueId = null;

// Get league ID from URL
const urlParams = new URLSearchParams(window.location.search);
leagueId = urlParams.get('league');

// DOM elements
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authStatus = document.getElementById('auth-status');
const contentContainer = document.getElementById('content-container');

// Auth state observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        authStatus.textContent = `Signed in as ${user.displayName}`;
        contentContainer.classList.remove('hidden');
        
        if (leagueId) {
            console.log('Loading league:', leagueId);
            loadLeague();
        } else {
            console.log('No league ID in URL');
            authStatus.textContent = 'No league selected. Please select a league from manage-leagues.html';
        }
    } else {
        currentUser = null;
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        authStatus.textContent = 'You are not signed in';
        contentContainer.classList.add('hidden');
    }
});

// Sign in
loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider).catch(error => {
        console.error("Auth error:", error);
        authStatus.textContent = `Error: ${error.message}`;
    });
});

// Sign out
logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        console.log("User signed out");
    }).catch(error => {
        console.error("Sign out error:", error);
    });
});

function loadLeague() {
    if (!leagueId) {
        console.log('No leagueId provided');
        return;
    }
    
    console.log(`Attempting to load league: ${leagueId}`);
    authStatus.textContent = 'Loading league...';
    
    const leagueRef = ref(database, `leagues/${leagueId}`);
    get(leagueRef).then((snapshot) => {
        console.log('League snapshot received:', snapshot.exists());
        
        if (snapshot.exists()) {
            const leagueData = snapshot.val();
            console.log("League data loaded:", leagueData);
            
            // Check if user is member
            if (!leagueData.teams || !leagueData.teams[currentUser.uid]) {
                console.log('User not a member. Teams:', leagueData.teams);
                console.log('Current user UID:', currentUser.uid);
                authStatus.textContent = `Access denied. You are not a member of this league.`;
                return;
            }
            
            // Hide league selection, show draft interface
            document.getElementById('league-select-container').classList.add('hidden');
            document.getElementById('draft-container').classList.remove('hidden');
            
            // Update UI
            document.getElementById('league-name').textContent = leagueData.name || 'League';
            authStatus.textContent = `Signed in as ${currentUser.displayName} - League: ${leagueData.name}`;
            
            // Load draft components
            loadDraftOrder(leagueData);
            loadDraftedPlayers(leagueData);
            loadAvailablePlayers();
            
        } else {
            console.log('League not found in database');
            authStatus.textContent = `League not found.`;
        }
    }).catch(error => {
        console.error("Error loading league:", error);
        authStatus.textContent = `Error loading league: ${error.message}`;
    });
}

function loadDraftOrder(leagueData) {
    console.log('Loading draft order...');
    const draftOrderContainer = document.querySelector('.draft-order-container .table-container tbody');
    
    if (!draftOrderContainer) {
        console.log('Draft order container not found');
        return;
    }
    
    if (!leagueData.draftStatus || !leagueData.draftStatus.draftOrder) {
        draftOrderContainer.innerHTML = '<tr><td colspan="3">No draft order available</td></tr>';
        return;
    }
    
    const draftOrder = leagueData.draftStatus.draftOrder;
    const teams = leagueData.teams;
    
    draftOrderContainer.innerHTML = '';
    draftOrder.forEach((teamUid, index) => {
        const team = teams[teamUid];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${team ? team.name : 'Unknown Team'}</td>
            <td>${teamUid === currentUser.uid ? 'You' : ''}</td>
        `;
        draftOrderContainer.appendChild(row);
    });
}

function loadDraftedPlayers(leagueData) {
    console.log('Loading drafted players...');
    const draftedTableBody = document.getElementById('draftedTableBody');
    
    if (!draftedTableBody) {
        console.log('Drafted table body not found');
        return;
    }
    
    if (!leagueData.draftedPlayers) {
        draftedTableBody.innerHTML = '<tr><td colspan="6">No players drafted yet</td></tr>';
        return;
    }
    
    const draftedPlayers = Object.entries(leagueData.draftedPlayers)
        .map(([key, player]) => ({...player, key}))
        .sort((a, b) => (a.draftNumber || 0) - (b.draftNumber || 0));
    
    draftedTableBody.innerHTML = '';
    draftedPlayers.forEach(player => {
        const team = leagueData.teams[player.teamUid];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${player.draftNumber || '-'}</td>
            <td>${player.Player || 'Unknown'}</td>
            <td>${player.Position || '-'}</td>
            <td class="hide-mobile">${player['NHL Team'] || '-'}</td>
            <td>${team ? team.name : 'Unknown Team'}</td>
            <td>-</td>
        `;
        draftedTableBody.appendChild(row);
    });
}

function loadAvailablePlayers() {
    console.log('Loading available players...');
    const playerTableBody = document.getElementById('playerTableBody');
    
    if (!playerTableBody) {
        console.log('Player table body not found');
        return;
    }
    
    // For now, just show a message that this would load from the NHL players JSON
    playerTableBody.innerHTML = '<tr><td colspan="7">Available players would load here from NHL data</td></tr>';
}