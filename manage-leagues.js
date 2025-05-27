// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, get, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

// Initialize Firebase with config
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
let currentUser = null;
let invitedManagers = [];
let foundLeague = null;

// Check for URL parameters (for direct join links)
const urlParams = new URLSearchParams(window.location.search);
let actionFromUrl = null;
let leagueIdFromUrl = null;
let leagueCodeFromUrl = null;

if (urlParams.has('action') && urlParams.has('league')) {
    actionFromUrl = urlParams.get('action');
    leagueIdFromUrl = urlParams.get('league');
    if (urlParams.has('code')) {
        leagueCodeFromUrl = urlParams.get('code');
    }
}

// Auth state observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        currentUser = user;
        document.getElementById('login-btn').classList.add('hidden');
        document.getElementById('logout-btn').classList.remove('hidden');
        document.getElementById('auth-status').textContent = `Signed in as ${user.displayName}`;
        document.getElementById('content-container').classList.remove('hidden');
        
        // Initialize Gmail API if needed
        initGmailAPI();
        
        // Load user's leagues
        loadUserLeagues();
        
        // Check for direct actions from URL
        handleUrlActions();
    } else {
        // User is signed out
        currentUser = null;
        document.getElementById('login-btn').classList.remove('hidden');
        document.getElementById('logout-btn').classList.add('hidden');
        document.getElementById('auth-status').textContent = 'You are not signed in';
        document.getElementById('content-container').classList.add('hidden');
    }
});

// Sign in with Google
document.getElementById('login-btn').addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            // User signed in
            console.log("User signed in:", result.user);
        }).catch((error) => {
            // Handle errors
            console.error("Auth error:", error);
            document.getElementById('auth-status').textContent = `Error: ${error.message}`;
        });
});

// Sign out
document.getElementById('logout-btn').addEventListener('click', () => {
    signOut(auth).then(() => {
        console.log("User signed out");
    }).catch((error) => {
        console.error("Sign out error:", error);
    });
});

// Handle actions from URL params
function handleUrlActions() {
    if (!actionFromUrl || !leagueIdFromUrl || !currentUser) return;
    
    if (actionFromUrl === 'join') {
        // If we have a direct join link with league ID and code
        findLeagueById(leagueIdFromUrl).then(league => {
            if (league) {
                foundLeague = {
                    id: leagueIdFromUrl,
                    ...league
                };
                
                // If user is already in this league, just go to tab
                if (league.teams && league.teams[currentUser.uid]) {
                    showNotification("You're already a member of this league");
                    openTab(null, 'my-leagues');
                    return;
                }
                
                // Switch to join tab and show league details
                openTab(null, 'join-league');
                
                // Ensure the elements exist before trying to set their content
                const leagueNameEl = document.getElementById('found-league-name'); // Assuming these IDs exist in your HTML for joining
                const leagueInfoEl = document.getElementById('found-league-info');
                const leagueDetailsEl = document.getElementById('league-details'); // This might be a container
                const passwordGroupEl = document.getElementById('join-password-required');
                const joinButton = document.getElementById('join-league-btn');

                if(leagueNameEl) leagueNameEl.textContent = league.name;
                if(leagueInfoEl) leagueInfoEl.textContent = `Teams: ${Object.keys(league.teams || {}).length}/${league.maxTeams}`;
                if(leagueDetailsEl) leagueDetailsEl.classList.remove('hidden');
                
                // Check if user is invited (doesn't need password)
                const isInvited = (league.invitedManagers || []).some(m => 
                    m.email === currentUser.email
                );
                
                // If we have a code from URL and it matches, or user is invited, no password needed
                if ((leagueCodeFromUrl && leagueCodeFromUrl === league.code) || isInvited) {
                    if(passwordGroupEl) passwordGroupEl.classList.add('hidden');
                } else {
                    if(passwordGroupEl) passwordGroupEl.classList.remove('hidden');
                }
                
                // Store data directly on the button if it exists
                if (joinButton) {
                    joinButton.dataset.leagueId = leagueIdFromUrl;
                    joinButton.dataset.leagueName = league.name;
                    joinButton.dataset.leagueCode = league.code;
                    joinButton.dataset.passwordRequired = !isInvited;
                    joinButton.dataset.passwordValue = league.password;
                    joinButton.dataset.isInvited = isInvited;
                }
            } else {
                showNotification("League not found");
            }
        }).catch(error => {
            console.error("Error finding league:", error);
            showNotification("Error finding league");
        });
    }
    
    // Clear URL params after handling
    window.history.replaceState({}, document.title, window.location.pathname);
    actionFromUrl = null;
    leagueIdFromUrl = null;
    leagueCodeFromUrl = null;
}

// Create league form submission
document.getElementById('create-league-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (!currentUser) {
        showNotification("You must be signed in to create a league");
        return;
    }
    
    const leagueName = document.getElementById('league-name').value.trim();
    const maxTeams = parseInt(document.getElementById('max-teams').value);
    const description = document.getElementById('description').value.trim();
    const password = document.getElementById('league-password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();
    
    if (!leagueName) {
        document.getElementById('create-status').innerHTML = '<div class="error">Please enter a league name</div>';
        return;
    }
    
    if (!password) {
        document.getElementById('create-status').innerHTML = '<div class="error">Please enter a league password</div>';
        return;
    }
    
    if (password !== confirmPassword) {
        document.getElementById('create-status').innerHTML = '<div class="error">Passwords do not match</div>';
        return;
    }
    
    // Generate a unique code for the league
    const leagueCode = generateLeagueCode();
    
    // Create the league object
    const leagueDataToSave = {
        name: leagueName,
        code: leagueCode,
        password: password,
        description: description,
        maxTeams: maxTeams,
        createdBy: {
            uid: currentUser.uid,
            name: currentUser.displayName,
            email: currentUser.email
        },
        createdAt: new Date().toISOString(),
        teams: {
            [currentUser.uid]: { // Creator is the first team and commissioner
                name: currentUser.displayName,
                uid: currentUser.uid,
                email: currentUser.email,
                isCommissioner: true,
                joinedAt: new Date().toISOString()
            }
        },
        invitedManagers: invitedManagers, // Array of {email, invitedAt}
        settings: {
            status: 'active', 
            draftStatus: 'pending' 
        }
    };
    
    // Save to Firebase
    const leaguesRef = ref(database, 'leagues');
    const newLeagueRef = push(leaguesRef);
    const newLeagueId = newLeagueRef.key;
    
    const initialChatMessageText = `League "${leagueName}" created by ${currentUser.displayName}`;

    set(newLeagueRef, leagueDataToSave)
        .then(() => {
            // Add the initial chat message
            return addChatMessage(newLeagueId, {
                type: 'system',
                text: initialChatMessageText,
                timestamp: leagueDataToSave.createdAt 
            });
        })
        .then(() => {
            // Link league to user under users/[uid]/leagues/[leagueId]
            const userLeaguesRef = ref(database, `users/${currentUser.uid}/leagues/${newLeagueId}`);
            return set(userLeaguesRef, {
                leagueId: newLeagueId,
                name: leagueName,
                code: leagueCode,
                role: 'commissioner', // User role in this league
                joinedAt: new Date().toISOString()
            });
        })
        .then(() => {
            // Show success message with sharing options
            const joinLink = `${window.location.origin}${window.location.pathname.replace('manage-leagues.html', '')}manage-leagues.html?action=join&league=${newLeagueId}&code=${leagueCode}`;
            
            document.getElementById('create-status').innerHTML = `
                <div class="success">
                    League created successfully!
                </div>
                <div class="share-box">
                    <p><strong>Share with others:</strong></p>
                    <p>League Code: <strong>${leagueCode}</strong></p>
                    <input type="text" class="share-link" value="${joinLink}" readonly>
                    <div>
                        <button type="button" class="copy-btn" onclick="copyToClipboard('${joinLink}')">Copy Link</button>
                        <a href="draftcentre.html?league=${newLeagueId}" class="btn">Go to Draftcentre</a>
                    </div>
                </div>
            `;
            
            if (invitedManagers.length > 0) {
                sendEmailInvitations(newLeagueId, leagueName, leagueCode, invitedManagers);
            }
            
            document.getElementById('create-league-form').reset();
            invitedManagers = []; // Clear the list after processing
            renderManagersList(); // Update the UI
            
            loadUserLeagues(); // Refresh "My Leagues" to show the newly created league
        })
        .catch((error) => {
            console.error("Error creating league:", error);
            document.getElementById('create-status').innerHTML = `<div class="error">Error creating league: ${error.message}</div>`;
        });
});

// Find league by code and display join option
window.findLeagueByCode = function() {
    if (!currentUser) {
        showNotification("You must be signed in to join a league");
        return;
    }

    const leagueCode = document.getElementById('league-code').value.trim();
    if (!leagueCode) {
        showNotification("Please enter a league code");
        return;
    }

    document.getElementById('join-status').innerHTML = '<div class="loading">Finding league...</div>';

    const leaguesRef = ref(database, 'leagues');
    get(leaguesRef).then((snapshot) => {
        if (!snapshot.exists()) {
            throw new Error("No leagues found in the database.");
        }

        const leagues = snapshot.val();
        let foundLeagueData = null;
        let foundLeagueId = null;

        Object.keys(leagues).forEach(id => {
            if (leagues[id].code === leagueCode) {
                foundLeagueId = id;
                foundLeagueData = { id, ...leagues[id] };
            }
        });

        if (!foundLeagueData) {
            throw new Error("League not found with this code.");
        }
        
        foundLeague = foundLeagueData; // Store globally for joinFoundLeague to use

        // Check if already a member
        if (foundLeague.teams && foundLeague.teams[currentUser.uid]) {
            showNotification("You're already a member of this league.");
            document.getElementById('join-status').innerHTML = `<div class="success">You are already a member. <a href="draftcentre.html?league=${foundLeagueId}">Go to Draftcentre</a></div>`;
            return;
        }

        // Check if league is full
        const teamCount = Object.keys(foundLeague.teams || {}).length;
        if (teamCount >= foundLeague.maxTeams) {
            throw new Error("This league is full.");
        }

        // Display league info and join button
        document.getElementById('join-status').innerHTML = `
            <div class="league-item">
                <div class="league-name">${foundLeague.name}</div>
                <div class="league-details">
                    Teams: ${teamCount}/${foundLeague.maxTeams} | 
                    Created by: ${foundLeague.createdBy?.name || 'Unknown'}
                    ${foundLeague.description ? `<br>${foundLeague.description}` : ''}
                </div>
                <div class="league-action">
                    <button onclick="joinFoundLeague('${foundLeagueId}')">Join This League</button>
                </div>
            </div>
        `;
    }).catch(error => {
        console.error("Error finding league by code:", error);
        document.getElementById('join-status').innerHTML = `<div class="error">${error.message}</div>`;
    });
};


// Join the found league (called after findLeagueByCode)
window.joinFoundLeague = function(leagueIdToJoin) { // Parameter renamed to avoid conflict with global leagueId
    if (!currentUser) {
        showNotification("You must be signed in to join a league.");
        return;
    }
    if (!foundLeague || foundLeague.id !== leagueIdToJoin) {
        showNotification("Error: League details not found. Please try finding the league again.");
        return;
    }

    const leagueToJoin = foundLeague; // Use the globally stored foundLeague

    // Double-check if already a member (should be caught by findLeagueByCode too)
    if (leagueToJoin.teams && leagueToJoin.teams[currentUser.uid]) {
        showNotification("You're already a member of this league.");
        return;
    }

    // Double-check if league is full
    const teamCount = Object.keys(leagueToJoin.teams || {}).length;
    if (teamCount >= leagueToJoin.maxTeams) {
        showNotification("This league is full.");
        return;
    }

    // Check if user was invited (skips password) or if password is required
    const isInvited = (leagueToJoin.invitedManagers || []).some(m => m.email === currentUser.email);
    let passwordCorrect = true; // Assume correct if invited

    if (!isInvited) {
        const passwordEntered = prompt(`Please enter the password for league "${leagueToJoin.name}":`);
        if (passwordEntered === null) return; // User cancelled
        if (passwordEntered.trim() !== leagueToJoin.password) {
            showNotification("Incorrect password.");
            passwordCorrect = false;
        }
    }

    if (passwordCorrect) {
        const teamRef = ref(database, `leagues/${leagueIdToJoin}/teams/${currentUser.uid}`);
        set(teamRef, {
            name: currentUser.displayName,
            uid: currentUser.uid,
            email: currentUser.email,
            isCommissioner: false, // New members are not commissioners by default
            joinedAt: new Date().toISOString()
        }).then(() => {
            // Add league to user's list of leagues
            const userLeagueRef = ref(database, `users/${currentUser.uid}/leagues/${leagueIdToJoin}`);
            return set(userLeagueRef, {
                leagueId: leagueIdToJoin,
                name: leagueToJoin.name,
                code: leagueToJoin.code,
                role: 'manager',
                joinedAt: new Date().toISOString()
            });
        }).then(() => {
            if (isInvited) {
                return removeInvitation(leagueIdToJoin, currentUser.email); // Remove from invited list
            }
            return Promise.resolve();
        }).then(() => {
            return addChatMessage(leagueIdToJoin, {
                type: 'system',
                text: `${currentUser.displayName} joined the league.`,
                timestamp: new Date().toISOString()
            });
        }).then(() => {
            showNotification("You've joined the league successfully!");
            document.getElementById('join-status').innerHTML = `<div class="success">Successfully joined! <a href="draftcentre.html?league=${leagueIdToJoin}">Go to Draftcentre</a></div>`;
            loadUserLeagues(); // Refresh the "My Leagues" list
            foundLeague = null; // Clear found league after joining
        }).catch(error => {
            console.error("Error joining league:", error);
            showNotification(`Error joining league: ${error.message}`);
            document.getElementById('join-status').innerHTML = `<div class="error">Error: ${error.message}</div>`;
        });
    }
};

// Accept invitation
window.acceptInvitation = function(leagueIdToAccept) {
    if (!currentUser) {
        showNotification("You must be signed in to accept an invitation.");
        return;
    }
    findLeagueById(leagueIdToAccept).then(league => {
        if (!league) {
            throw new Error("League not found to accept invitation.");
        }
        if (league.teams && league.teams[currentUser.uid]) {
            throw new Error("You are already a member of this league.");
        }
        const teamCount = Object.keys(league.teams || {}).length;
        if (teamCount >= league.maxTeams) {
            throw new Error("This league is full and cannot accept new members.");
        }
        const isInvited = (league.invitedManagers || []).some(m => m.email === currentUser.email);
        if (!isInvited) {
            throw new Error("You were not invited to this league, or the invitation is no longer valid.");
        }

        const teamRef = ref(database, `leagues/${leagueIdToAccept}/teams/${currentUser.uid}`);
        return set(teamRef, {
            name: currentUser.displayName,
            uid: currentUser.uid,
            email: currentUser.email,
            isCommissioner: false,
            joinedAt: new Date().toISOString()
        }).then(() => {
            const userLeagueRef = ref(database, `users/${currentUser.uid}/leagues/${leagueIdToAccept}`);
            return set(userLeagueRef, {
                leagueId: leagueIdToAccept,
                name: league.name,
                code: league.code,
                role: 'manager',
                joinedAt: new Date().toISOString()
            });
        }).then(() => {
            return removeInvitation(leagueIdToAccept, currentUser.email);
        }).then(() => {
            return addChatMessage(leagueIdToAccept, {
                type: 'system',
                text: `${currentUser.displayName} accepted an invitation and joined the league.`,
                timestamp: new Date().toISOString()
            });
        }).then(() => {
            showNotification("Invitation accepted! You've joined the league.");
            loadUserLeagues(); // Refresh "My Leagues" and "Invitations"
        });
    }).catch(error => {
        console.error("Error accepting invitation:", error);
        showNotification(`Error accepting invitation: ${error.message}`);
    });
};

// Decline invitation
window.declineInvitation = function(leagueIdToDecline) {
    if (!currentUser) {
        showNotification("You must be signed in to decline an invitation.");
        return;
    }
    removeInvitation(leagueIdToDecline, currentUser.email).then(() => {
        showNotification("Invitation declined.");
        loadUserLeagues(); // Refresh "Invitations" list
    }).catch(error => {
        console.error("Error declining invitation:", error);
        showNotification(`Error declining invitation: ${error.message}`);
    });
};

//clear join search
window.clearJoinSearch = function () {
    foundLeague = null;
    // Clear the specific join status message area instead of the whole invitations list.
    const joinStatusEl = document.getElementById('join-status');
    if (joinStatusEl) {
        joinStatusEl.innerHTML = '';
    }
    // The invitations list will be re-rendered by loadUserLeagues if needed.
    // It's better not to directly manipulate parts of UI that are managed by loadUserLeagues.
};

// Load user's leagues and invitations
function loadUserLeagues() {
    if (!currentUser) return;
    
    const activeLeaguesEl = document.getElementById('active-leagues');
    const invitationsEl = document.getElementById('league-invitations');
    
    activeLeaguesEl.innerHTML = '<div class="loading">Loading your leagues...</div>';
    invitationsEl.innerHTML = '<div class="loading">Loading invitations...</div>';
    
    // Path to user's list of league memberships/roles
    const userLeaguesPath = `users/${currentUser.uid}/leagues`;
    const userLeaguesRef = ref(database, userLeaguesPath);
    
    console.log(`Fetching league memberships from: ${userLeaguesPath}`);
    get(userLeaguesRef).then((userLeaguesSnapshot) => {
        const userLeagueEntries = userLeaguesSnapshot.exists() ? userLeaguesSnapshot.val() : {};
        console.log("User's league entries:", userLeagueEntries);

        // Path to all leagues to get details and find invitations
        const allLeaguesRef = ref(database, 'leagues');
        console.log("Fetching all leagues from: leagues");
        return get(allLeaguesRef).then((allLeaguesSnapshot) => {
            const allLeaguesData = allLeaguesSnapshot.exists() ? allLeaguesSnapshot.val() : {};
            console.log("All leagues data:", Object.keys(allLeaguesData).length > 0 ? "Some leagues found" : "No leagues in DB");
            return { userLeagueEntries, allLeaguesData };
        });
    }).then(({ userLeagueEntries, allLeaguesData }) => {
        let activeLeagues = [];
        let invitedLeagues = [];
        
        // Populate Active Leagues based on user's league entries
        const leagueDetailPromises = Object.keys(userLeagueEntries).map(leagueId => {
            const userLeagueRole = userLeagueEntries[leagueId].role;
            // Fetch full details for each league the user is part of
            const leagueDetailRef = ref(database, `leagues/${leagueId}`);
            return get(leagueDetailRef).then(leagueSnapshot => {
                if (leagueSnapshot.exists()) {
                    activeLeagues.push({
                        id: leagueId,
                        ...leagueSnapshot.val(),
                        userRole: userLeagueRole, // Add user's role in this league
                        status: 'active' // Assuming if it's in user's list, it's active for them
                    });
                } else {
                    console.warn(`League details not found for ID: ${leagueId} (listed in user's leagues)`);
                }
            });
        });

        // Find invitations from all leagues
        Object.keys(allLeaguesData).forEach(leagueId => {
            const league = allLeaguesData[leagueId];
            // Check if user is already a member (already handled by activeLeagues population)
            if (userLeagueEntries[leagueId]) {
                return; 
            }
            // Check for pending invitations
            if (league.invitedManagers && Array.isArray(league.invitedManagers)) {
                const isInvited = league.invitedManagers.some(manager => manager.email === currentUser.email);
                if (isInvited) {
                    invitedLeagues.push({
                        id: leagueId,
                        ...league,
                        status: 'invited'
                    });
                }
            }
        });
        
        // Wait for all active league details to be fetched
        Promise.all(leagueDetailPromises).then(() => {
            console.log("Active leagues to render:", activeLeagues);
            console.log("Invited leagues to render:", invitedLeagues);
            renderActiveLeagues(activeLeagues);
            renderLeagueInvitations(invitedLeagues);
        }).catch(error => {
             console.error("Error fetching details for one or more active leagues:", error);
            activeLeaguesEl.innerHTML = `<div class="error">Error loading some league details.</div>`;
            // Still render invitations if they were found
            renderLeagueInvitations(invitedLeagues);
        });

    }).catch(error => {
        console.error("Error loading user leagues and invitations:", error);
        activeLeaguesEl.innerHTML = `<div class="error">Error loading your leagues.</div>`;
        invitationsEl.innerHTML = `<div class="error">Error loading invitations.</div>`;
    });
}

// Render active leagues
function renderActiveLeagues(leagues) {
    const leaguesContainer = document.getElementById('active-leagues');
    
    if (leagues.length === 0) {
        leaguesContainer.innerHTML = '<p>You haven\'t joined any leagues yet. Create a new league or join an existing one.</p>';
        return;
    }
    
    leaguesContainer.innerHTML = ''; // Clear previous entries or loading message
    leagues.forEach(league => {
        const leagueItem = document.createElement('div');
        leagueItem.className = 'league-item';
        
        let draftStatusText = 'Draft Pending';
        let draftStatusClass = 'status-pending';
        if (league.settings?.draftStatus === 'active' || league.draftStatus?.active) { // Check both paths for compatibility
            draftStatusText = 'Draft in Progress';
            draftStatusClass = 'status-active';
        } else if (league.settings?.draftStatus === 'completed') {
            draftStatusText = 'Draft Completed';
            draftStatusClass = 'status-active';
        }
        
        const commissionerBadge = league.userRole === 'commissioner' ? 
            '<span class="badge commissioner-badge">Commissioner</span>' : '';
        
        leagueItem.innerHTML = `
            <div class="league-name">
                ${league.name}
                ${commissionerBadge}
                <span class="league-status ${draftStatusClass}">${draftStatusText}</span>
            </div>
            <div class="league-details">
                Teams: ${Object.keys(league.teams || {}).length}/${league.maxTeams || 'N/A'}
                ${league.description ? `<br>${league.description}` : ''}
            </div>
            <div class="league-action">
                <a href="draftcentre.html?league=${league.id}" class="btn">Go to Draftcentre</a>
                <a href="league.html?id=${league.id}" class="btn">View League</a>
                ${league.userRole === 'commissioner' ? `<button onclick="manageLeague('${league.id}')">Manage</button>` : ''}
            </div>
        `;
        
        leaguesContainer.appendChild(leagueItem);
    });
}

// Render league invitations
function renderLeagueInvitations(leagues) {
    const leaguesContainer = document.getElementById('league-invitations');
    
    if (leagues.length === 0) {
        leaguesContainer.innerHTML = '<p>No pending invitations.</p>';
        return;
    }
    
    leaguesContainer.innerHTML = ''; // Clear previous entries or loading message
    leagues.forEach(league => {
        const leagueItem = document.createElement('div');
        leagueItem.className = 'league-item';
        
        leagueItem.innerHTML = `
            <div class="league-name">
                ${league.name}
                <span class="league-status status-invitation">Invitation</span>
            </div>
            <div class="league-details">
                Teams: ${Object.keys(league.teams || {}).length}/${league.maxTeams || 'N/A'}
                <br>From: ${league.createdBy?.name || 'Unknown'}
                ${league.description ? `<br>${league.description}` : ''}
            </div>
            <div class="league-action">
                <button onclick="acceptInvitation('${league.id}')">Accept</button>
                <button onclick="declineInvitation('${league.id}')" class="remove-btn">Decline</button>
            </div>
        `;
        
        leaguesContainer.appendChild(leagueItem);
    });
}

// Add chat message
function addChatMessage(leagueId, message) {
    // Make sure we're using the correct path for chat messages
    const chatRef = ref(database, `leagues/${leagueId}/chat`);
    const newMessageRef = push(chatRef);
    return set(newMessageRef, message);
}

// Remove invitation
function removeInvitation(leagueId, email) {
    return findLeagueById(leagueId).then(league => {
        if (!league || !league.invitedManagers) {
            return;
        }
        
        // Find and remove the invitation
        const updatedInvites = league.invitedManagers.filter(m => 
            m.email !== email
        );
        
        // Update the league
        const invitesRef = ref(database, `leagues/${leagueId}/invitedManagers`);
        return set(invitesRef, updatedInvites);
    });
}

// Find league by ID
function findLeagueById(leagueId) {
    const leagueRef = ref(database, `leagues/${leagueId}`);
    return get(leagueRef).then(snapshot => {
        if (snapshot.exists()) {
            const league = snapshot.val();
            if (!league.teams) league.teams = {};
            if (!league.settings) league.settings = {};
            return league;
        }
        return null;
    });
}

// Initialize Gmail API
function initGmailAPI() {
    console.log("Initializing Gmail API...");
    
    // Check if the gapi library exists
    if (!window.gapi) {
        console.error("Google API client not loaded");
        return;
    }
    
    // Load the API client library
    gapi.load('client', () => {
        console.log("GAPI client loaded, initializing...");
        
        gapi.client.init({
            apiKey: window.gmailConfig?.apiKey || 'PLACEHOLDER',
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest']
        }).then(() => {
            console.log('Gmail API initialized successfully');
        }).catch(error => {
            console.error('Error initializing Gmail API', error);
        });
    });
}

// Send email invitations to invited managers
function sendEmailInvitations(leagueId, leagueName, leagueCode, invitedManagers) {
    console.log("Sending email invitations to:", invitedManagers);
    
    if (!invitedManagers || invitedManagers.length === 0) {
        console.log("No managers to invite");
        return;
    }
    
    // Create a more specific join link with the league ID and code
    const joinLink = `${window.location.origin}${window.location.pathname.replace('manage-leagues.html', '')}manage-leagues.html?action=join&league=${leagueId}&code=${leagueCode}`;
    
    // Create comma-separated list of all recipient emails
    const allEmails = invitedManagers.map(manager => manager.email).join(', ');
    
    // Create the email content with a direct link that includes the league ID and code
    const emailContent = `
        <html>
            <body>
                <h2>You've been invited to join a Fantasy Hockey League!</h2>
                <p>You've been invited by ${currentUser.displayName} to join the league "${leagueName}".</p>
                <p>To join this league, simply click the link below:</p>
                <p><a href="${joinLink}">Join "${leagueName}" League</a></p>
                <p>Or you can join manually with this code: <strong>${leagueCode}</strong></p>
                <p>Good luck!</p>
            </body>
        </html>
    `;
    
    // Show notification
    showNotification(`Sending invitation to ${invitedManagers.length} recipients...`);
    
    // Send a single email to all recipients
    sendEmail(allEmails, `Fantasy Hockey League Invitation: ${leagueName}`, emailContent);
}

// Send an email using the Gmail API with Google Identity Services
function sendEmail(to, subject, bodyHtml) {
    console.log("Starting email send process to:", to);
    
    // Check if we already have access or need to request it
    const hasGrantedAccess = gapi.client.getToken() !== null;
    console.log("Has granted access:", hasGrantedAccess);
    
    // Check if the necessary libraries are loaded
    if (!window.gapi) {
        console.error("Google API client not loaded");
        showNotification("Error: Google API client not loaded");
        return;
    }
    
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        console.error("Google Identity Services not initialized");
        showNotification("Error: Google Identity Services not initialized");
        return;
    }
    
    // Check if Gmail API is initialized
    if (!gapi.client.gmail) {
        console.log("Gmail API not initialized, initializing now...");
        
        gapi.client.init({
            apiKey: window.gmailConfig?.apiKey || 'PLACEHOLDER',
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest']
        }).then(() => {
            console.log("Gmail API initialized, continuing with authentication");
            proceedWithAuthentication();
        }).catch(error => {
            console.error("Error initializing Gmail API:", error);
            showNotification("Error initializing Gmail API: " + error.message);
        });
    } else {
        proceedWithAuthentication();
    }
    
    function proceedWithAuthentication() {
        console.log("Creating token client...");
        
        // Create token client for OAuth with explicit error handling
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: window.gmailConfig?.clientId || 'PLACEHOLDER',
            scope: 'https://www.googleapis.com/auth/gmail.send',
            callback: (tokenResponse) => {
                if (tokenResponse.error) {
                    console.error('Error getting token:', tokenResponse);
                    showNotification(`Authentication failed: ${tokenResponse.error}`);
                    return;
                }
                
                console.log("Token received successfully");
                
                // Set access token for the client
                gapi.client.setToken(tokenResponse);
                
                // Now send the actual email
                sendEmailWithToken();
            }
        });
        
        // Request an access token
        console.log("Requesting access token...");
        tokenClient.requestAccessToken();
    }
    
    function sendEmailWithToken() {
        console.log("Preparing email content...");
        
        try {
            // Create the email content in base64url encoded format
            const email = [
                'Content-Type: text/html; charset="UTF-8"',
                'MIME-Version: 1.0',
                `To: ${to}`,
                `Subject: ${subject}`,
                '',
                bodyHtml
            ].join('\r\n');
            
            const encodedEmail = btoa(unescape(encodeURIComponent(email)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            
            console.log("Sending email request...");
            showNotification("Sending invitation...");
            
            // Send the email
            gapi.client.gmail.users.messages.send({
                'userId': 'me',
                'resource': {
                    'raw': encodedEmail
                }
            }).then(response => {
                console.log('Email sent successfully:', response);
                showNotification(`Invitation sent to ${to}`);
            }).catch(error => {
                console.error('Error sending email:', error);
                showNotification(`Failed to send invitation to ${to}: ${error.message}`);
            });
        } catch (error) {
            console.error("Error encoding email:", error);
            showNotification("Error preparing email: " + error.message);
        }
    }
}

// Copy to clipboard
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification("Link copied to clipboard!");
    }).catch(err => {
        console.error('Could not copy text: ', err);
    });
};

// Toggle password visibility
window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    const toggleBtn = input.nextElementSibling;
    
    if (input.type === "password") {
        input.type = "text";
        toggleBtn.textContent = "Hide";
    } else {
        input.type = "password";
        toggleBtn.textContent = "Show";
    }
};

// Manage league functionality
window.manageLeague = function(leagueId) {
    // Redirect to a league management page
    window.location.href = `manage-league-details.html?id=${leagueId}`;
};

// Add manager to invite list
window.addManager = function() {
    const managerEmail = document.getElementById('manager-email').value.trim();
    
    if (!managerEmail || !validateEmail(managerEmail)) {
        showNotification("Please enter a valid email address");
        return;
    }
    
    if (invitedManagers.some(m => m.email === managerEmail)) {
        showNotification("This email has already been added");
        return;
    }
    
    invitedManagers.push({
        email: managerEmail,
        invitedAt: new Date().toISOString()
    });
    
    renderManagersList();
    document.getElementById('manager-email').value = '';
};

// Remove manager from invite list
window.removeManager = function(index) {
    invitedManagers.splice(index, 1);
    renderManagersList();
};

// Render managers list
function renderManagersList() {
    const managersListEl = document.getElementById('managers-list');
    managersListEl.innerHTML = '';
    
    invitedManagers.forEach((manager, index) => {
        const managerItem = document.createElement('div');
        managerItem.className = 'manager-item';
        managerItem.innerHTML = `
            <div>${manager.email}</div>
            <button type="button" class="remove-btn" onclick="removeManager(${index})">Remove</button>
        `;
        managersListEl.appendChild(managerItem);
    });
}

// Generate a random league code
function generateLeagueCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking characters
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Validate email format
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
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

// Tab navigation
window.openTab = function(evt, tabName) {
    var i, tabcontent, tablinks;
    
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    
    document.getElementById(tabName).style.display = "block";
    
    // If evt is null, this was programmatically called
    if (evt) {
        evt.currentTarget.className += " active";
    } else {
        // Find the tab button for this tab and make it active
        for (i = 0; i < tablinks.length; i++) {
            if (tablinks[i].getAttribute('onclick').includes(tabName)) {
                tablinks[i].className += " active";
                break;
            }
        }
    }
};

// Make functions available in window context for HTML onclick handlers
window.findLeagueByCode = findLeagueByCode;
window.joinFoundLeague = joinFoundLeague;
window.acceptInvitation = acceptInvitation;
window.declineInvitation = declineInvitation;
window.copyToClipboard = copyToClipboard;
window.togglePasswordVisibility = togglePasswordVisibility;
window.manageLeague = manageLeague;
window.addManager = addManager;
window.removeManager = removeManager;
window.openTab = openTab;
