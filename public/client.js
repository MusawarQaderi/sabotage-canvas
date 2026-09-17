const socket = io(); 
const els = {
  connectionDot: document.getElementById('connectionDot'),
  landingView: document.getElementById('landingView'),
  createNicknameInput: document.getElementById('createNicknameInput'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  createError: document.getElementById('createError'),
  joinNicknameInput: document.getElementById('joinNicknameInput'),
  joinRoomInput: document.getElementById('joinRoomInput'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  joinError: document.getElementById('joinError'),
  lobbyView: document.getElementById('lobbyView'),
  lobbyRoomCode: document.getElementById('lobbyRoomCode'),
  lobbyInviteBtn: document.getElementById('lobbyInviteBtn'),
  lobbyPlayersList: document.getElementById('lobbyPlayersList'),
  lobbyPlayerCount: document.getElementById('lobbyPlayerCount'),
  lobbyStartBtn: document.getElementById('lobbyStartBtn'),
  lobbyLeaveBtn: document.getElementById('lobbyLeaveBtn'),
  gameView: document.getElementById('gameView'),
  roomCodeDisplay: document.getElementById('roomCodeDisplay'),
  roundDisplay: document.getElementById('roundDisplay'),
  startBtn: document.getElementById('startBtn'),
  playAgainBtn: document.getElementById('playAgainBtn'),
  leaveGameBtn: document.getElementById('leaveGameBtn'),
  timerLabel: document.getElementById('timerLabel'),
  timerValue: document.getElementById('timerValue'),
  timerBar: document.getElementById('timerBar'),
  statusLine: document.getElementById('statusLine'),
  legend: document.getElementById('legend'),
  categoryText: document.getElementById('categoryText'),
  wordText: document.getElementById('wordText'),
  imposterBadge: document.getElementById('imposterBadge'),
  artistWarning: document.getElementById('artistWarning'),
  sabotageBtn: document.getElementById('sabotageBtn'),
  optionsPanel: document.getElementById('optionsPanel'),
  optionsList: document.getElementById('optionsList'),
  playersList: document.getElementById('playersList'),
  votePanel: document.getElementById('votePanel'),
  voteCards: document.getElementById('voteCards'),
  showdownPanel: document.getElementById('showdownPanel'),
  showdownText: document.getElementById('showdownText'),
  showdownOptions: document.getElementById('showdownOptions'),
  canvas: document.getElementById('gameCanvas'),
  canvasOverlay: document.getElementById('canvasOverlay'),
  canvasOverlayText: document.getElementById('canvasOverlayText'),
  sabotageOverlay: document.getElementById('sabotageOverlay')
};

const ctx = els.canvas.getContext('2d');
const appState = {
  myId: null, roomCode: null, roomState: null,
  roleInfo: { category: null, word: null, isImposter: false, options: [], sabotageUsed: false },
  strokes: [], pointerDown: false, myVoteTarget: null,
  timerMode: null, timerEndsAt: null, timerTotalMs: null, timerInterval: null,
  cssWidth: 0, cssHeight: 0, currentView: 'landing'
};

let audioCtx = null;
let lastDrawEmit = 0;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone({ freq, duration, type = 'sine', gain = 0.05, rampTo = null }) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (rampTo) osc.frequency.exponentialRampToValueAtTime(rampTo, now + duration);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gainNode); gainNode.connect(audioCtx.destination);
  osc.start(now); osc.stop(now + duration + 0.02);
}

function playTick() { playTone({ freq: 880, duration: 0.08, type: 'square', gain: 0.03 }); }
function playGong() { playTone({ freq: 220, rampTo: 130, duration: 0.52, type: 'sine', gain: 0.09 }); }
function playSabotage() { playTone({ freq: 150, rampTo: 60, duration: 1.0, type: 'sawtooth', gain: 0.1 }); }
function vibrate(pattern) { if (navigator.vibrate) try { navigator.vibrate(pattern); } catch (_) {} }

function setStatus(message) { els.statusLine.textContent = message; }

function showView(name) {
  appState.currentView = name;
  els.landingView.classList.toggle('hidden', name !== 'landing');
  els.lobbyView.classList.toggle('hidden', name !== 'lobby');
  els.gameView.classList.toggle('hidden', name !== 'game');
  if (name === 'game') requestAnimationFrame(() => resizeCanvas());
}

function resizeCanvas() {
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const rect = els.canvas.getBoundingClientRect();
  appState.cssWidth = rect.width; appState.cssHeight = rect.height;
  els.canvas.width = Math.floor(rect.width * dpr); els.canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.2;
  redrawAllStrokes();
}

function clearCanvas() { ctx.clearRect(0, 0, appState.cssWidth, appState.cssHeight); }

function redrawAllStrokes() {
  clearCanvas();
  if (!appState.cssWidth || !appState.strokes.length) return;
  let currentColor = null;
  for (const stroke of appState.strokes) {
    const x = stroke.x * appState.cssWidth, y = stroke.y * appState.cssHeight;
    if (stroke.isNewStroke || currentColor !== stroke.color) {
      if (currentColor !== null) ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.strokeStyle = stroke.color; currentColor = stroke.color;
    } else { ctx.lineTo(x, y); }
  }
  if (currentColor !== null) ctx.stroke();
}

function drawStroke(stroke) {
  const x = stroke.x * appState.cssWidth, y = stroke.y * appState.cssHeight;
  ctx.strokeStyle = stroke.color;
  if (stroke.isNewStroke) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y + 0.01); ctx.stroke(); return; }
  ctx.lineTo(x, y); ctx.stroke();
}

function getMyPlayer() { return appState.roomState?.players?.find((p) => p.id === appState.myId) || null; }
function canDraw() { return appState.roomState?.phase === 'drawing' && appState.roomState?.activePlayerId === appState.myId; }

function getPointerNorm(event) {
  const rect = els.canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

function sendPoint(event, isNewStroke) {
  const now = Date.now();
  if (!isNewStroke && now - lastDrawEmit < 20) return; // Throttling: max ~50 FPS
  lastDrawEmit = now;
  const { x, y } = getPointerNorm(event);
  socket.emit('drawPoint', { x, y, isNewStroke });
}

function startTimer(mode, endsAt, totalMs, label) {
  appState.timerMode = mode; appState.timerEndsAt = endsAt; appState.timerTotalMs = totalMs;
  els.timerLabel.textContent = label;
  if (appState.timerInterval) clearInterval(appState.timerInterval);
  appState.timerInterval = setInterval(updateTimerUI, 50);
  updateTimerUI();
}

function clearTimer() {
  appState.timerMode = appState.timerEndsAt = null;
  if (appState.timerInterval) clearInterval(appState.timerInterval);
  els.timerValue.textContent = '--.-s'; els.timerBar.style.width = '0%';
}

function updateTimerUI() {
  if (!appState.timerEndsAt) return clearTimer();
  const remain = Math.max(0, appState.timerEndsAt - Date.now());
  els.timerBar.style.width = `${Math.max(0, Math.min(1, remain / appState.timerTotalMs)) * 100}%`;
  els.timerValue.textContent = `${(remain / 1000).toFixed(1)}s`;
  if (remain === 0) clearTimer();
}

function renderLegend() {
  els.legend.innerHTML = (appState.roomState?.drawingLegend || []).map(p => 
    `<div class="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium">
      <span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background:${p.color}"></span>${p.nickname}
    </div>`
  ).join('');
}

function renderPlayers() {
  els.playersList.innerHTML = (appState.roomState?.players || []).map(p => {
    const active = appState.roomState?.activePlayerId === p.id;
    return `
      <div class="rounded-xl border px-4 py-3 transition ${active ? 'border-[#6366f1] bg-[#6366f1]/10 shadow-[0_0_15px_rgba(99,102,241,0.2)] pulse' : 'border-zinc-800 bg-zinc-900/50'}">
        <div class="flex items-center justify-between gap-2">
          <div class="font-bold text-sm flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${p.color}"></span>${p.nickname}</div>
          <div class="text-xs text-zinc-400 font-mono">${p.score} pts</div>
        </div>
        <div class="mt-1 text-[10px] font-bold uppercase tracking-wider ${p.isHost ? 'text-zinc-500' : 'text-zinc-600'}">${p.isHost ? 'Host' : active ? 'Zeichnet...' : 'Spieler'}</div>
      </div>
    `;
  }).join('');
}

function renderLobbyPlayers() {
  const players = appState.roomState?.players || [];
  els.lobbyPlayerCount.textContent = `${players.length}/${appState.roomState?.maxPlayers || 8}`;
  els.lobbyPlayersList.innerHTML = players.map(p => `
    <div class="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      <span class="w-3 h-3 rounded-full" style="background:${p.color}"></span><span class="font-bold flex-1">${p.nickname}</span>
      ${p.isHost ? '<span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Host</span>' : ''}
    </div>
  `).join('');
  const isHost = appState.roomState?.hostId === appState.myId;
  els.lobbyStartBtn.disabled = !isHost || players.length < (appState.roomState?.minPlayers || 3);
}

function renderVoteCards() {
  const voteCounts = new Map((appState.roomState?.voteCounts || []).map(e => [e.targetId, e.count]));
  els.voteCards.innerHTML = '';
  for (const player of appState.roomState?.players || []) {
    const btn = document.createElement('button');
    const selected = appState.myVoteTarget === player.id;
    btn.className = `w-full text-left rounded-xl border px-4 py-3 font-bold transition-all ${selected ? 'border-brand bg-brand/20' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`;
    btn.innerHTML = `<div class="flex justify-between"><span><span class="w-2.5 h-2.5 rounded-full mr-2 inline-block" style="background:${player.color}"></span>${player.nickname}</span><span class="text-xs text-zinc-400">${voteCounts.get(player.id) || 0} Votes</span></div>`;
    btn.addEventListener('click', () => {
      if (appState.roomState?.phase !== 'voting') return;
      appState.myVoteTarget = player.id;
      socket.emit('castVote', { targetId: player.id }); vibrate(30); renderVoteCards();
    });
    els.voteCards.appendChild(btn);
  }
}

function renderOptionsAndShowdown() {
  const role = appState.roleInfo;
  const opts = role.options || [];
  
  // Sidebar Liste (Mind-Game)
  els.optionsList.innerHTML = opts.map(opt => {
    const isCorrect = !role.isImposter && opt === role.word;
    return `<div class="px-2 py-1.5 rounded bg-zinc-900 border ${isCorrect ? 'border-emerald-500 text-emerald-400' : 'border-zinc-800 text-zinc-400'} text-xs font-bold text-center">${opt}</div>`;
  }).join('');
  
  // Showdown Buttons (Nur für Imposter klickbar)
  els.showdownOptions.innerHTML = '';
  if (role.isImposter && appState.roomState?.phase === 'showdown') {
    els.showdownOptions.classList.remove('hidden');
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'w-full rounded-xl px-4 py-3 bg-brand text-white font-bold hover:bg-brandHover transition-colors';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        ensureAudio(); socket.emit('submitImposterGuess', { guess: opt });
      });
      els.showdownOptions.appendChild(btn);
    });
  } else {
    els.showdownOptions.classList.add('hidden');
  }
}

function updateRolePanel() {
  const role = appState.roleInfo;
  els.categoryText.textContent = role.category || '-';
  els.wordText.textContent = role.isImposter ? '???' : role.word || '-';
  
  const showRoles = appState.roomState?.phase !== 'lobby';
  els.imposterBadge.classList.toggle('hidden', !role.isImposter || !showRoles);
  els.artistWarning.classList.toggle('hidden', role.isImposter || !showRoles);
  
  // Sabotage Button Logik
  const showSabotage = role.isImposter && appState.roomState?.phase === 'drawing';
  els.sabotageBtn.classList.toggle('hidden', !showSabotage);
  els.sabotageBtn.disabled = role.sabotageUsed;
  
  els.optionsPanel.classList.toggle('hidden', !showRoles || !role.options.length);
  renderOptionsAndShowdown();
}

function updatePhasePanels() {
  const phase = appState.roomState?.phase;
  const isHost = getMyPlayer()?.isHost;
  
  els.startBtn.classList.toggle('hidden', phase !== 'lobby' || !isHost);
  els.playAgainBtn.classList.toggle('hidden', phase !== 'ended' || !isHost);
  els.votePanel.classList.toggle('hidden', phase !== 'voting');
  els.showdownPanel.classList.toggle('hidden', phase !== 'showdown' && phase !== 'ended');
  
  if (phase === 'drawing') startTimer('draw', appState.roomState.turnEndsAt, 3000, 'Turn-Timer');
  else if (phase === 'voting') startTimer('vote', appState.roomState.voteEndsAt, 30000, 'Voting');
  else if (phase === 'showdown') startTimer('showdown', appState.roomState.showdownEndsAt, 15000, 'Showdown');
  else clearTimer();

  if (phase === 'showdown') {
    els.showdownText.textContent = appState.roleInfo.isImposter ? 'Wähle das korrekte Wort!' : 'Der Imposter rät...';
  } else if (phase === 'ended') {
    const res = appState.roomState.result;
    els.showdownText.textContent = res?.outcome === 'imposter_victory' ? 'Imposter Victory' : res?.outcome === 'heist_win' ? 'Heist Win' : 'Artists Win';
  }

  els.roundDisplay.textContent = appState.roomState?.roundNumber || 1;
  
  // Canvas Overlay
  if (phase === 'drawing' && !canDraw()) {
    const active = appState.roomState?.players?.find(p => p.id === appState.roomState.activePlayerId);
    els.canvasOverlayText.textContent = active ? `${active.nickname} zeichnet...` : '';
    els.canvasOverlay.classList.remove('hidden');
  } else if (phase !== 'drawing' && phase !== 'lobby') {
    els.canvasOverlayText.textContent = phase === 'voting' ? 'Voting...' : phase === 'showdown' ? 'Showdown!' : 'Runde beendet';
    els.canvasOverlay.classList.remove('hidden');
  } else {
    els.canvasOverlay.classList.add('hidden');
  }
}

function renderState() {
  if (!appState.roomState) return;
  els.roomCodeDisplay.textContent = els.lobbyRoomCode.textContent = appState.roomCode || '----';
  setStatus(appState.roomState.phase.toUpperCase());
  renderLegend(); renderPlayers(); renderLobbyPlayers(); renderVoteCards();
  updateRolePanel(); updatePhasePanels();
  showView(appState.roomState.phase === 'lobby' ? 'lobby' : 'game');
}

// Events
els.createRoomBtn.addEventListener('click', () => { ensureAudio(); socket.emit('createRoom', { nickname: els.createNicknameInput.value }); });
els.joinRoomBtn.addEventListener('click', () => { ensureAudio(); socket.emit('joinRoom', { nickname: els.joinNicknameInput.value, roomCode: els.joinRoomInput.value }); });
els.lobbyStartBtn.addEventListener('click', () => { ensureAudio(); socket.emit('startGame'); });
els.startBtn.addEventListener('click', () => { ensureAudio(); socket.emit('startGame'); });
els.playAgainBtn.addEventListener('click', () => { ensureAudio(); socket.emit('playAgain'); });
els.leaveGameBtn.addEventListener('click', () => { socket.emit('leaveRoom'); showView('landing'); });
els.lobbyLeaveBtn.addEventListener('click', () => { socket.emit('leaveRoom'); showView('landing'); });

els.sabotageBtn.addEventListener('click', () => {
  ensureAudio();
  socket.emit('triggerSabotage');
});

const onDown = (e) => { ensureAudio(); if(!canDraw()) return; e.preventDefault(); appState.pointerDown = true; sendPoint(e, true); };
const onMove = (e) => { if(appState.pointerDown && canDraw()){ e.preventDefault(); sendPoint(e, false); } };
const onUp = () => { if(appState.pointerDown){ appState.pointerDown = false; socket.emit('strokeEnd'); } };
els.canvas.addEventListener('pointerdown', onDown);
els.canvas.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
els.canvas.addEventListener('pointercancel', onUp);

window.addEventListener('resize', resizeCanvas);

// Socket Listeners
socket.on('connect', () => { els.connectionDot.textContent = 'ONLINE'; els.connectionDot.className = 'px-4 py-2 rounded-full bg-emerald-950 text-emerald-500 border border-emerald-900 text-xs font-bold uppercase tracking-wider font-mono'; });
socket.on('disconnect', () => { els.connectionDot.textContent = 'OFFLINE'; els.connectionDot.className = 'px-4 py-2 rounded-full bg-rose-950 text-rose-500 border border-rose-900 text-xs font-bold uppercase tracking-wider font-mono'; });
socket.on('joinedRoom', ({ roomCode, playerId }) => { appState.roomCode = roomCode; appState.myId = playerId; socket.emit('requestCanvasSync'); });
socket.on('leftRoom', () => showView('landing'));
socket.on('roomState', (s) => { appState.roomState = s; renderState(); });
socket.on('roleInfo', (r) => { appState.roleInfo = r; updateRolePanel(); });
socket.on('drawPoint', (s) => { appState.strokes.push(s); drawStroke(s); });
socket.on('canvasReset', () => { appState.strokes = []; clearCanvas(); els.canvas.classList.remove('sabotage-active'); });
socket.on('canvasSnapshot', (s) => { appState.strokes = Array.isArray(s) ? s : []; redrawAllStrokes(); });
socket.on('phaseChanged', ({ phase }) => { playGong(); vibrate([50, 30, 50]); if(phase==='drawing') appState.myVoteTarget = null; });
socket.on('turnAdvanced', () => vibrate(15));
socket.on('errorMessage', (m) => { els.createError.textContent = els.joinError.textContent = m; setStatus(m); });

// Sabotage Event
socket.on('sabotageTriggered', () => {
  playSabotage();
  vibrate([100, 50, 100, 50, 200]);
  
  // Zeige Warnung
  els.sabotageOverlay.classList.remove('hidden');
  els.canvas.classList.add('sabotage-active');
  
  setTimeout(() => {
    els.sabotageOverlay.classList.add('hidden');
  }, 1500);

  // Blur Effekt bleibt für 4 Sekunden
  setTimeout(() => {
    els.canvas.classList.remove('sabotage-active');
  }, 4000);
});
