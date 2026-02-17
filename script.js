const API_BASE = 'https://api.ayush.ltd/api';
let currentSession = null;
let currentPlayerId = null;
let isCreator = false;
let gameState = null;
let timers = {};
let lastPhase = 'waiting';

// ── Unified Adaptive Poller ─────────────────────────────────────────────
let _pollTimer = null;
let _pollPaused = false;

// Phase → polling interval in ms
const POLL_INTERVALS = {
    waiting: 5000,  // lobby – nothing urgent
    discussion: 5000,  // players talking, low urgency
    playing: 5000,  // alias for discussion
    voting: 2000,  // votes are time-sensitive
    reveal: 3000,  // short wait for reveal button
    result: 5000,  // slow poll – detect "play again" from creator
};

function getPollingInterval() {
    return POLL_INTERVALS[lastPhase] || 4000;
}

function startPolling() {
    stopPolling();
    const interval = getPollingInterval();
    if (interval === 0) return; // result phase – don't poll
    _pollTimer = setInterval(() => {
        if (_pollPaused) return;
        if (lastPhase === 'waiting') {
            refreshLobby();
        } else {
            loadGameState();
        }
    }, interval);
}

function stopPolling() {
    if (_pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
    }
}

// Restart poller when phase changes (new interval may be needed)
function restartPollingIfNeeded(newPhase) {
    if (POLL_INTERVALS[newPhase] !== POLL_INTERVALS[lastPhase]) {
        startPolling();
    }
}

// Pause/resume when browser tab visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        _pollPaused = true;
    } else {
        _pollPaused = false;
        // Immediately fetch fresh state when user returns
        if (currentSession) {
            if (lastPhase === 'waiting') refreshLobby();
            else loadGameState();
        }
    }
});

console.log('Game script loaded successfully');

// Show message helper
function showMessage(message, type = 'info') {
    const msgEl = type === 'error' ? document.getElementById('error-message') : document.getElementById('success-message');
    msgEl.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    msgEl.style.display = 'block';
    setTimeout(() => {
        msgEl.style.display = 'none';
    }, 5000);
}

// Toggle form visibility
function toggleCreateForm() {
    console.log('toggleCreateForm() called');
    const createForm = document.getElementById('create-form');
    const joinForm = document.getElementById('join-form');
    createForm.style.display = createForm.style.display === 'none' ? 'block' : 'none';
    if (joinForm.style.display === 'block') joinForm.style.display = 'none';
    console.log('Create form display:', createForm.style.display);
}

function toggleJoinForm() {
    console.log('toggleJoinForm() called');
    const createForm = document.getElementById('create-form');
    const joinForm = document.getElementById('join-form');
    joinForm.style.display = joinForm.style.display === 'none' ? 'block' : 'none';
    if (createForm.style.display === 'block') createForm.style.display = 'none';
    console.log('Join form display:', joinForm.style.display);
}

// Create Game
async function createGame() {
    console.log('createGame() called');
    const name = document.getElementById('creator-name').value.trim();
    const category = document.getElementById('game-category').value;
    const maxPlayers = parseInt(document.getElementById('max-players').value);

    console.log('Form values:', { name, category, maxPlayers });

    if (!name) {
        console.log('Name is empty');
        showMessage('Please enter your name', 'error');
        return;
    }

    if (!category) {
        console.log('Category is empty');
        showMessage('Please select a category', 'error');
        return;
    }

    if (maxPlayers < 3) {
        console.log('Max players is less than 3');
        showMessage('Max players should be at least 3', 'error');
        return;
    }

    try {
        console.log('Sending API request to create game...');
        const response = await fetch(`${API_BASE}/game/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                player_name: name,
                game_category: category,
                max_players: maxPlayers
            })
        });

        console.log('API Response status:', response.status);
        const data = await response.json();
        console.log('API Response data:', data);

        if (data.success) {
            console.log('Game created successfully');
            currentSession = data.session_id;
            currentPlayerId = data.player_id;
            isCreator = true;

            document.getElementById('initial-screen').style.display = 'none';
            document.getElementById('game-created-screen').style.display = 'block';
            document.getElementById('game-code-display').textContent = data.session_id;
            document.getElementById('game-category-display').textContent = data.game_category;
            document.getElementById('start-btn').style.display = 'block';

            showMessage(`Code: ${data.session_id}`, 'success');
            refreshLobby();
            startPolling();
        } else {
            console.log('API returned error:', data.message);
            showMessage(data.message, 'error');
        }
    } catch (error) {
        console.error('Catch error:', error);
        showMessage('Error creating game: ' + error.message, 'error');
    }
}

// Join Game
async function joinGame() {
    const name = document.getElementById('join-player-name').value.trim();
    const sessionId = document.getElementById('session-id').value.trim();

    if (!name || !sessionId) {
        showMessage('Please enter name and game code', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/game/${sessionId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_name: name })
        });

        const data = await response.json();

        if (data.success) {
            currentSession = sessionId;
            currentPlayerId = data.player_id;
            isCreator = false;

            document.getElementById('initial-screen').style.display = 'none';
            document.getElementById('game-created-screen').style.display = 'block';
            document.getElementById('game-code-display').textContent = sessionId;
            document.getElementById('start-btn').style.display = 'none';

            showMessage(`Joined!`, 'success');
            refreshLobby();
            startPolling();
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Error joining game: ' + error.message, 'error');
    }
}

// Refresh Lobby
// Refresh Lobby
async function refreshLobby() {
    try {
        const response = await fetch(`${API_BASE}/game/${currentSession}?player_id=${currentPlayerId}`);
        const data = await response.json();

        if (data.success) {
            // Check if game phase has changed from waiting to playing (for joined players to detect start)
            if (lastPhase === 'waiting' && data.current_phase !== 'waiting') {
                lastPhase = data.current_phase;
                // Game has been started by creator, transition to game screen
                document.getElementById('game-created-screen').style.display = 'none';
                document.getElementById('game-playing-screen').style.display = 'block';
                startGameTimers();
                loadGameState();
                startPolling();
                return;
            }
            lastPhase = data.current_phase;

            const playersHtml = data.players.map(p =>
                `<div class="player-item">
                    <span class="player-name">${p.player_name}</span>
                    <span class="player-status">${p.is_alive ? '🟢' : '🔴'}</span>
                </div>`
            ).join('');
            document.getElementById('lobby-players').innerHTML = playersHtml;

            // Only show start button to creator
            if (isCreator) {
                const startBtn = document.getElementById('start-btn');
                const topicsReady = data.topics_ready !== false; // default true for backward compat
                const enoughPlayers = data.players.length >= 3;

                startBtn.disabled = !enoughPlayers || !topicsReady;

                if (!enoughPlayers) {
                    startBtn.textContent = `Need ${3 - data.players.length} more`;
                } else if (!topicsReady) {
                    startBtn.textContent = '⏳ Generating topics...';
                } else {
                    startBtn.textContent = 'Start Game';
                }
            }
        }
    } catch (error) {
        console.error('Error refreshing lobby:', error);
    }
}

// Manual refresh trigger
async function manualRefreshLobby() {
    const btn = event.target;
    btn.style.transform = 'rotate(360deg)';
    btn.style.transition = 'transform 0.6s ease-in-out';

    await refreshLobby();

    setTimeout(() => {
        btn.style.transform = 'rotate(0deg)';
    }, 600);
}

// Legacy aliases – kept so existing calls don't break
function startLobbyAutoRefresh() { startPolling(); }
function stopLobbyAutoRefresh() { /* handled by unified poller */ }

// Start Game
async function startGame() {
    try {
        // Pre-flight: ensure topics are ready before starting
        const checkResp = await fetch(`${API_BASE}/game/${currentSession}?player_id=${currentPlayerId}`);
        const checkData = await checkResp.json();
        if (checkData.success && checkData.topics_ready === false) {
            showMessage('Topics are still being generated, please wait a moment...', 'info');
            return;
        }

        const response = await fetch(`${API_BASE}/game/${currentSession}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: currentPlayerId })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('Game started!', 'success');
            document.getElementById('game-created-screen').style.display = 'none';
            document.getElementById('game-playing-screen').style.display = 'block';
            startGameTimers();
            loadGameState();
            startPolling();
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Error starting game: ' + error.message, 'error');
    }
}

// Load Game State
async function loadGameState() {
    try {
        const response = await fetch(`${API_BASE}/game/${currentSession}?player_id=${currentPlayerId}`);
        const data = await response.json();
        console.log('loadGameState data:', data);

        if (data.success) {
            // Handle transition from result back to lobby or into a new round
            if (lastPhase === 'result' && data.current_phase !== 'result') {
                document.getElementById('game-result-screen').style.display = 'none';
                clearGameTimers();
                // If server moved back to waiting, show created (lobby) screen
                if (data.current_phase === 'waiting') {
                    document.getElementById('game-created-screen').style.display = 'block';
                    lastPhase = 'waiting';
                    refreshLobby();
                    return;
                } else {
                    // Server started a new round (discussion/voting), show playing screen
                    document.getElementById('game-playing-screen').style.display = 'block';
                    startGameTimers();
                    // continue to render the current game state below
                }
            }

            gameState = data;
            restartPollingIfNeeded(data.current_phase);
            lastPhase = data.current_phase;

            // Display the topic word
            document.getElementById('topic-display').textContent = data.your_topic || 'Loading...';

            // Display players
            const playersHtml = data.players.map(p =>
                `<div class="player-item ${!p.is_alive ? 'voted-out' : ''}">
                    <span class="player-name">${p.player_name}${currentPlayerId === p.player_id ? ' (You)' : ''}</span>
                    <span class="player-status">${!p.is_alive ? '❌' : '🟢'}</span>
                </div>`
            ).join('');

            document.getElementById('game-players').innerHTML = playersHtml;

            // Enforce strict UI per phase
            if (data.current_phase === 'discussion' || data.current_phase === 'playing') {
                // Discussion: only show Start Voting
                document.getElementById('discussion-actions').style.display = 'block';
                document.getElementById('voting-section').style.display = 'none';
                document.getElementById('reveal-section').style.display = 'none';
            } else if (data.current_phase === 'voting') {
                // Voting: show voting UI only
                document.getElementById('discussion-actions').style.display = 'none';
                document.getElementById('voting-section').style.display = 'block';
                document.getElementById('reveal-section').style.display = 'none';
                showVotingPhase(data);
            } else if (data.current_phase === 'reveal') {
                // Reveal: show only reveal button/section
                document.getElementById('discussion-actions').style.display = 'none';
                document.getElementById('voting-section').style.display = 'none';
                document.getElementById('reveal-section').style.display = 'block';
            } else if (data.current_phase === 'result') {
                showGameResult();
            } else if (data.current_phase === 'waiting') {
                // Waiting: treat as lobby
                document.getElementById('game-playing-screen').style.display = 'none';
                document.getElementById('game-created-screen').style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error loading game state:', error);
    }
}

// Show Voting Phase
function showVotingPhase(data) {
    document.getElementById('discussion-actions').style.display = 'none';
    document.getElementById('voting-section').style.display = 'block';

    const hasVoted = data.voters.includes(currentPlayerId);

    const votingButtonsHtml = data.players
        .filter(p => p.is_alive)
        .map(p =>
            `<button onclick="submitVote('${p.player_id}')" ${hasVoted ? 'disabled' : ''}>
                ${p.player_name}
                ${data.voters.includes(p.player_id) ? '<span class="voted-check">✔</span>' : ''}
            </button>`
        ).join('');

    document.getElementById('voting-buttons').innerHTML = votingButtonsHtml;

    if (hasVoted) {
        document.getElementById('voting-buttons').innerHTML += '<p style="text-align:center;color:#8a84a8;margin-top:8px;font-size:13px;">Voted ✓</p>';
    }
}

// Submit Vote
async function submitVote(targetPlayerId) {
    try {
        const response = await fetch(`${API_BASE}/game/${currentSession}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                voted_for_id: targetPlayerId,
                player_id: currentPlayerId
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('Vote submitted!', 'success');
            loadGameState();
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Error submitting vote: ' + error.message, 'error');
    }
}

// Transition to Voting
async function transitionToVoting() {
    try {
        const response = await fetch(`${API_BASE}/game/${currentSession}/transition-voting`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            loadGameState();
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Error transitioning to voting: ' + error.message, 'error');
    }
}



// Show Game Result
async function showGameResult() {
    console.log('showGameResult called');
    try {
        const response = await fetch(`${API_BASE}/game/${currentSession}/result`);
        const data = await response.json();

        if (data.success && data.game_result) {
            const result = data.game_result;

            // Support both new (list) and old (singular) response shapes
            const votedOutNames = result.voted_out_names || [result.voted_out_name];
            const votedOutIds = result.voted_out_ids || [result.voted_out_id];
            const isTie = result.is_tie || false;

            // Build voted-out display
            const votedOutDisplay = votedOutNames.map(name =>
                `<span style="font-weight:700;">${name}</span>`
            ).join(', ');

            const tieBadge = isTie
                ? `<span style="display:inline-block; background:rgba(255,152,0,0.2); color:#ffcc99; border:1px solid rgba(255,152,0,0.4); padding:4px 12px; border-radius:20px; font-size:13px; margin-bottom:10px;">⚡ TIE — ${votedOutNames.length} players eliminated</span><br>`
                : '';

            const resultHtml = `
                <div class="alert ${result.is_imposter_caught ? 'alert-success' : 'alert-warning'}" style="font-size: 16px; padding: 20px; text-align: center;">
                    ${tieBadge}
                    <strong>${result.message}</strong>
                    <p style="margin-top: 10px; font-size: 16px;">Voted out: ${votedOutDisplay}</p>
                    <p style="margin-top: 5px; font-size: 16px;">Winners: <strong>${result.winners}</strong></p>
                </div>
            `;
            document.getElementById('game-result-content').innerHTML = resultHtml;

            const tableHtml = data.players.map(p => {
                const wasVotedOut = votedOutIds.includes(p.player_id);
                const rowStyle = wasVotedOut
                    ? 'border-left: 3px solid rgba(255,152,0,0.6);'
                    : '';
                return `
                <tr style="${rowStyle}">
                    <td>${p.player_name}${wasVotedOut && isTie ? ' ⚡' : ''}</td>
                    <td>${p.player_id === result.imposter_id ? '🕵️ Imposter' : '👥 Player'}</td>
                    <td>${p.is_alive ? '🟢 Alive' : '❌ Voted Out'}</td>
                </tr>
                `;
            }).join('');
            document.getElementById('result-table-body').innerHTML = tableHtml;

            document.getElementById('game-playing-screen').style.display = 'none';
            document.getElementById('game-result-screen').style.display = 'block';

            clearGameTimers();
        }
    } catch (error) {
        console.error('Error loading result:', error);
    }
}

// List Available Games
async function listGames() {
    try {
        const response = await fetch(`${API_BASE}/games/available`);
        const data = await response.json();

        if (data.success && data.games.length > 0) {
            const gamesHtml = `
                <h3 style="margin-top: 20px;">Available Games</h3>
                <div class="games-grid">
                    ${data.games.map(game => `
                        <div class="game-item" onclick="selectGame('${game.session_id}')">
                            <h4>${game.game_category}</h4>
                            <p>👥 ${game.player_count}/${game.max_players}</p>
                            <button onclick="selectGame('${game.session_id}', event)" style="width: 100%; padding: 8px;">Join</button>
                        </div>
                    `).join('')}
                </div>
            `;
            document.getElementById('available-games').innerHTML = gamesHtml;
        } else {
            document.getElementById('available-games').innerHTML = '<p style="text-align:center;color:#8a84a8;margin-top:20px;font-size:13px;">No games found</p>';
        }
    } catch (error) {
        showMessage('Error loading games: ' + error.message, 'error');
    }
}

// Select Game to Join
function selectGame(sessionId, event) {
    if (event) event.stopPropagation();
    document.getElementById('session-id').value = sessionId;
    document.getElementById('session-id').focus();
}

// Game Timers
function startGameTimers() {
    clearGameTimers();
    document.getElementById('game-timer').textContent = '0:00';
    let elapsedTime = 0;
    const maxDiscussionTime = 600; // 10 minutes

    timers.discussion = setInterval(() => {
        const mins = Math.floor(elapsedTime / 60);
        const secs = elapsedTime % 60;
        document.getElementById('game-timer').textContent =
            `${mins}:${secs.toString().padStart(2, '0')}`;
        elapsedTime++;

        // Auto-transition to voting after 10 minutes
        if (elapsedTime > maxDiscussionTime) {
            clearInterval(timers.discussion);
            showMessage('10 minutes elapsed! Starting voting phase...', 'info');
            transitionToVoting();
        }
    }, 1000);
}

function clearGameTimers() {
    Object.values(timers).forEach(timer => clearInterval(timer));
    timers = {};
}

// Legacy alias – kept so existing calls don't break
function startAutoRefresh() { startPolling(); }

// Go Back
function goBack(fromResult = false) {
    if (currentSession && !fromResult) {
        const confirmation = confirm("Leave this game?");
        if (!confirmation) {
            return;
        }
    }

    clearGameTimers();
    stopPolling();

    document.getElementById('initial-screen').style.display = 'block';
    document.getElementById('game-created-screen').style.display = 'none';
    document.getElementById('game-playing-screen').style.display = 'none';
    document.getElementById('game-result-screen').style.display = 'none';
    document.getElementById('create-form').style.display = 'none';
    document.getElementById('join-form').style.display = 'none';

    currentSession = null;
    currentPlayerId = null;
    isCreator = false;
    gameState = null;
    lastPhase = 'waiting';
}

async function playAgain() {
    if (!isCreator) {
        showMessage("Only the creator can restart.", "info");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/game/${currentSession}/new-round`, {
            method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
            showMessage('Starting a new round!', 'success');
            document.getElementById('game-result-screen').style.display = 'none';
            document.getElementById('game-created-screen').style.display = 'block';
            lastPhase = 'waiting';
            refreshLobby();
            startPolling();
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Error starting new round: ' + error.message, 'error');
    }
}
