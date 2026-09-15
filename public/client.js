const socket = io();

const els = {
  // Connection
  connectionDot: document.getElementById('connectionDot'),
  // Landing view
  landingView: document.getElementById('landingView'),
  createNicknameInput: document.getElementById('createNicknameInput'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  createError: document.getElementById('createError'),
  joinNicknameInput: document.getElementById('joinNicknameInput'),
  joinRoomInput: document.getElementById('joinRoomInput'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  joinError: document.getElementById('joinError'),
  // Lobby view
  lobbyView: document.getElementById('lobbyView'),
  lobbyRoomCode: document.getElementById('lobbyRoomCode'),
  lobbyInviteBtn: document.getElementById('lobbyInviteBtn'),
  lobbyPlayersList: document.getElementById('lobbyPlayersList'),
  lobbyPlayerCount: document.getElementById('lobbyPlayerCount'),
  lobbyStartBtn: document.getElementById('lobbyStartBtn'),
  lobbyStartHint: document.getElementById('lobbyStartHint'),
  lobbyLeaveBtn: document.getElementById('lobbyLeaveBtn'),
  // Game view
  gameView: document.getElementById('gameView'),
  roomCodeDisplay: document.getElementById('roomCodeDisplay'),
  roundDisplay: document.getElementById('roundDisplay'),
  inviteBtn: document.getElementById('inviteBtn'),
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
  imposterHintsPanel: document.getElementById('imposterHintsPanel'),
  imposterHintsList: document.getElementById('imposterHintsList'),
  playersList: document.getElementById('playersList'),
  votePanel: document.getElementById('votePanel'),
  voteCards: document.getElementById('voteCards'),
  showdownPanel: document.getElementById('showdownPanel'),
  showdownText: document.getElementById('showdownText'),
  guessWrap: document.getElementById('guessWrap'),
  guessInput: document.getElementById('guessInput'),
  submitGuessBtn: document.getElementById('submitGuessBtn'),
  canvas: document.getElementById('gameCanvas'),
  canvasOverlay: document.getElementById('canvasOverlay'),
  canvasOverlayText: document.getElementById('canvasOverlayText')
};

const ctx = els.canvas.getContext('2d');

const appState = {
  myId: null,
  roomCode: null,
  roomState: null,
  roleInfo: { category: null, word: null, isImposter: false, imposterHints: [] },
  strokes: [],
  pointerDown: false,
  myVoteTarget: null,
  timerMode: null,
  timerEndsAt: null,
  timerTotalMs: null,
  timerInterval: null,
  timerLastTickSecond: null,
  cssWidth: 0,
  cssHeight: 0,
  currentView: 'landing'
};

let audioCtx = null;
let popAt = 0;

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
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playPop() {
  if (!audioCtx) return;
  const now = performance.now();
  if (now - popAt < 80) return;
  popAt = now;
  playTone({ freq: 530, rampTo: 280, duration: 0.07, type: 'triangle', gain: 0.035 });
}

function playTick() {
  if (!audioCtx) return;
  playTone({ freq: 880, duration: 0.08, type: 'square', gain: 0.03 });
}

function playGong() {
  if (!audioCtx) return;
  playTone({ freq: 220, rampTo: 130, duration: 0.52, type: 'sine', gain: 0.09 });
  playTone({ freq: 330, rampTo: 180, duration: 0.45, type: 'triangle', gain: 0.05 });
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (_) {}
  }
}

function sanitizeCode(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 4);
}

function sanitizeNickname(value) {
  return String(value || '').trim().slice(0, 20);
}

function setCreateError(message) {
  els.createError.textContent = message || '';
}

function setJoinError(message) {
  els.joinError.textContent = message || '';
}

function setStatus(message) {
  els.statusLine.textContent = message;
}

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
  appState.cssWidth = rect.width;
  appState.cssHeight = rect.height;
  els.canvas.width = Math.floor(rect.width * dpr);
  els.canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.2;
  redrawAllStrokes();
}

function clearCanvas() {
  ctx.clearRect(0, 0, appState.cssWidth, appState.cssHeight);
}

function redrawAllStrokes() {
  clearCanvas();
  if (!appState.cssWidth || !appState.cssHeight || !appState.strokes.length) return;
  let currentColor = null;
  for (const stroke of appState.strokes) {
    const x = stroke.x * appState.cssWidth;
    const y = stroke.y * appState.cssHeight;
    if (stroke.isNewStroke || currentColor !== stroke.color) {
      if (currentColor !== null) ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = stroke.color;
      currentColor = stroke.color;
    } else {
      ctx.lineTo(x, y);
    }
  }
  if (currentColor !== null) ctx.stroke();
}

function drawStroke(stroke) {
  const x = stroke.x * appState.cssWidth;
  const y = stroke.y * appState.cssHeight;
  ctx.strokeStyle = stroke.color;
  if (stroke.isNewStroke) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
    return;
  }
  ctx.lineTo(x, y);
  ctx.stroke();
}

function getMyPlayer() {
  return appState.roomState?.players?.find((p) => p.id === appState.myId) || null;
}

function canDraw() {
  return (
    appState.roomState?.phase === 'drawing' &&
    appState.roomState?.activePlayerId === appState.myId
  );
}

function getPointerNorm(event) {
  const rect = els.canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y))
  };
}

function sendPoint(event, isNewStroke) {
  const { x, y } = getPointerNorm(event);
  socket.emit('drawPoint', { x, y, isNewStroke });
  playPop();
}

function startTimer(mode, endsAt, totalMs, label) {
  appState.timerMode = mode;
  appState.timerEndsAt = endsAt;
  appState.timerTotalMs = totalMs;
  appState.timerLastTickSecond = null;
  els.timerLabel.textContent = label;
  if (appState.timerInterval) clearInterval(appState.timerInterval);
  appState.timerInterval = setInterval(updateTimerUI, 50);
  updateTimerUI();
}

function clearTimer() {
  appState.timerMode = null;
  appState.timerEndsAt = null;
  appState.timerTotalMs = null;
  appState.timerLastTickSecond = null;
  if (appState.timerInterval) clearInterval(appState.timerInterval);
  appState.timerInterval = null;
  els.timerValue.textContent = '--.-s';
  els.timerBar.style.width = '0%';
}

function updateTimerUI() {
  if (!appState.timerEndsAt || !appState.timerTotalMs) {
    clearTimer();
    return;
  }
  const remain = Math.max(0, appState.timerEndsAt - Date.now());
  const pct = Math.max(0, Math.min(1, remain / appState.timerTotalMs));
  els.timerBar.style.width = `${pct * 100}%`;
  els.timerValue.textContent = `${(remain / 1000).toFixed(1)}s`;
  if (appState.timerMode === 'draw' && remain <= 3000) {
    const second = Math.ceil(remain / 1000);
    if (second > 0 && second !== appState.timerLastTickSecond) {
      appState.timerLastTickSecond = second;
      playTick();
      vibrate(20);
    }
  }
  if (remain === 0) clearTimer();
}

function renderLegend() {
  const players = appState.roomState?.drawingLegend || [];
  els.legend.innerHTML = '';
  for (const player of players) {
    const item = document.createElement('div');
    item.className = 'text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80';
    item.innerHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style="background:${player.color}"></span>${player.nickname}`;
    els.legend.appendChild(item);
  }
}

function renderPlayers() {
  const players = appState.roomState?.players || [];
  els.playersList.innerHTML = '';
  for (const player of players) {
    const active = appState.roomState?.activePlayerId === player.id;
    const card = document.createElement('div');
    card.className = `rounded-xl border px-3 py-2.5 transition ${active ? 'shadow-neonCyan border-cyan-400/60 bg-cyan-500/10 pulse' : 'border-slate-700 bg-slate-900/70'}`;
    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="font-medium flex items-center gap-2">
          <span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${player.color}"></span>
          <span>${player.nickname}</span>
        </div>
        <div class="text-xs text-slate-300 font-mono">${player.score} pts</div>
      </div>
      <div class="mt-1 text-[11px] ${player.isHost ? 'text-amber-300' : 'text-slate-400'}">${player.isHost ? 'HOST' : active ? 'AKTIVER ZUG' : 'SPIELER'}</div>
    `;
    els.playersList.appendChild(card);
  }
}

function renderLobbyPlayers() {
  const players = appState.roomState?.players || [];
  const maxPlayers = appState.roomState?.maxPlayers || 8;
  els.lobbyPlayerCount.textContent = `${players.length}/${maxPlayers}`;
  els.lobbyPlayersList.innerHTML = '';
  for (const player of players) {
    const item = document.createElement('div');
    item.className = 'flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2.5';
    const hostTag = player.isHost ? '<span class="text-[10px] font-mono uppercase text-amber-300 border border-amber-400/40 rounded px-1.5 py-0.5">Host</span>' : '';
    item.innerHTML = `
      <span class="inline-block w-3 h-3 rounded-full" style="background:${player.color}"></span>
      <span class="font-medium flex-1">${player.nickname}</span>
      ${hostTag}
    `;
    els.lobbyPlayersList.appendChild(item);
  }
  const isHost = appState.roomState?.hostId === appState.myId;
  const canStart = players.length >= (appState.roomState?.minPlayers || 3);
  els.lobbyStartBtn.disabled = !isHost || !canStart;
  if (!isHost) {
    els.lobbyStartHint.textContent = 'Nur der Host kann das Spiel starten';
  } else if (!canStart) {
    els.lobbyStartHint.textContent = `Mindestens ${appState.roomState?.minPlayers || 3} Spieler benötigt`;
  } else {
    els.lobbyStartHint.textContent = 'Bereit zum Start!';
  }
}

function renderVoteCards() {
  const players = appState.roomState?.players || [];
  const voteCounts = new Map((appState.roomState?.voteCounts || []).map((entry) => [entry.targetId, entry.count]));
  els.voteCards.innerHTML = '';
  for (const player of players) {
    const btn = document.createElement('button');
    const selected = appState.myVoteTarget === player.id;
    btn.className = `w-full text-left rounded-xl border px-3 py-2 transition-all ${selected ? 'border-rose-400/70 bg-rose-500/15 shadow-neonRose' : 'border-slate-700 bg-slate-900/70 hover:border-rose-400/50'}`;
    btn.innerHTML = `
      <div class="flex items-center justify-between">
        <span><span class="inline-block w-2.5 h-2.5 rounded-full mr-2" style="background:${player.color}"></span>${player.nickname}</span>
        <span class="text-xs text-slate-300 font-mono">${voteCounts.get(player.id) || 0} Votes</span>
      </div>
    `;
    btn.addEventListener('click', () => {
      if (appState.roomState?.phase !== 'voting') return;
      appState.myVoteTarget = player.id;
      socket.emit('castVote', { targetId: player.id });
      vibrate(30);
      renderVoteCards();
    });
    els.voteCards.appendChild(btn);
  }
}

function renderImposterHints() {
  const hints = appState.roleInfo.imposterHints || [];
  els.imposterHintsList.innerHTML = '';
  hints.forEach((hint, i) => {
    const item = document.createElement('div');
    item.className = 'hint-card flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-sm';
    item.innerHTML = `
      <span class="text-amber-300 font-mono text-xs">Tipp ${i + 1}</span>
      <span class="text-slate-200">${hint}</span>
    `;
    els.imposterHintsList.appendChild(item);
  });
}

function updateRolePanel() {
  const role = appState.roleInfo;
  els.categoryText.textContent = role.category || '-';
  els.wordText.textContent = role.isImposter ? '???' : role.word || '-';
  els.imposterBadge.classList.toggle('hidden', !role.isImposter || appState.roomState?.phase === 'lobby');

  const showHints = role.isImposter && appState.roomState?.phase !== 'lobby';
  els.imposterHintsPanel.classList.toggle('hidden', !showHints);
  if (showHints) renderImposterHints();
}

function phaseStatusText() {
  const phase = appState.roomState?.phase;
  if (!phase) return 'Warte auf Verbindung...';
  if (phase === 'lobby') {
    return `Lobby: ${appState.roomState.players.length} Spieler — Warte auf Spielstart`;
  }
  if (phase === 'drawing') {
    const active = appState.roomState.players.find((p) => p.id === appState.roomState.activePlayerId);
    if (!active) return 'Zeichenphase läuft';
    if (active.id === appState.myId) return 'Du bist dran: Setze den ersten Strich für den 3-Sekunden-Countdown!';
    return `${active.nickname} ist am Zug`;
  }
  if (phase === 'voting') {
    return `Voting läuft: ${appState.roomState.votesSubmitted}/${appState.roomState.totalVotesExpected} Stimmen`;
  }
  if (phase === 'showdown') {
    return 'Imposter-Showdown läuft';
  }
  if (phase === 'ended') {
    const result = appState.roomState.result;
    if (!result) return 'Runde beendet';
    if (result.outcome === 'imposter_victory') return 'Imposter Victory: Der Imposter hat euch ausgetrickst!';
    if (result.outcome === 'heist_win') return 'Heist Win: Der Imposter hat das geheime Wort erraten!';
    return 'Artists Win: Der Imposter wurde gestoppt!';
  }
  return 'Spielstatus wird synchronisiert...';
}

function updateCanvasOverlay() {
  const phase = appState.roomState?.phase;
  if (phase === 'lobby') {
    els.canvasOverlay.classList.remove('hidden');
    els.canvasOverlayText.textContent = 'Warte auf Spielstart...';
  } else if (phase === 'drawing' && !canDraw()) {
    els.canvasOverlay.classList.remove('hidden');
    const active = appState.roomState?.players?.find((p) => p.id === appState.roomState?.activePlayerId);
    els.canvasOverlayText.textContent = active ? `${active.nickname} zeichnet...` : 'Warte...';
  } else if (phase === 'voting') {
    els.canvasOverlay.classList.remove('hidden');
    els.canvasOverlayText.textContent = 'Voting-Phase';
  } else if (phase === 'showdown') {
    els.canvasOverlay.classList.remove('hidden');
    els.canvasOverlayText.textContent = 'Showdown!';
  } else if (phase === 'ended') {
    els.canvasOverlay.classList.remove('hidden');
    els.canvasOverlayText.textContent = 'Runde beendet';
  } else {
    els.canvasOverlay.classList.add('hidden');
  }
}

function updatePhasePanels() {
  const phase = appState.roomState?.phase;
  const me = getMyPlayer();
  const isHost = me && appState.roomState?.hostId === me.id;
  els.startBtn.classList.toggle('hidden', phase !== 'lobby' || !isHost);
  els.playAgainBtn.classList.toggle('hidden', phase !== 'ended' || !isHost);
  els.votePanel.classList.toggle('hidden', phase !== 'voting');
  els.showdownPanel.classList.toggle('hidden', phase !== 'showdown' && phase !== 'ended');
  if (phase === 'drawing') {
    if (appState.roomState.turnEndsAt) {
      startTimer('draw', appState.roomState.turnEndsAt, 3000, '3-Sekunden-Timer');
    } else {
      clearTimer();
      els.timerLabel.textContent = '3-Sekunden-Timer';
    }
  } else if (phase === 'voting') {
    if (appState.roomState.voteEndsAt) {
      startTimer('vote', appState.roomState.voteEndsAt, 30000, 'Voting-Timer');
    }
  } else if (phase === 'showdown') {
    if (appState.roomState.showdownEndsAt) {
      startTimer('showdown', appState.roomState.showdownEndsAt, 15000, 'Showdown-Timer');
    }
  } else {
    clearTimer();
  }
  if (phase === 'showdown') {
    if (appState.roleInfo.isImposter) {
      els.showdownText.textContent = 'Du wurdest enttarnt! Rate jetzt das geheime Wort in 15 Sekunden.';
      els.guessWrap.classList.remove('hidden');
    } else {
      els.showdownText.textContent = 'Der Imposter hat 15 Sekunden, um das geheime Wort zu erraten...';
      els.guessWrap.classList.add('hidden');
    }
  } else {
    els.guessWrap.classList.add('hidden');
  }
  if (phase === 'ended') {
    const result = appState.roomState.result;
    let text = 'Runde beendet.';
    if (result?.outcome === 'imposter_victory') text = 'Imposter Victory';
    if (result?.outcome === 'heist_win') text = 'Heist Win';
    if (result?.outcome === 'artists_win') text = 'Artists Win';
    els.showdownText.textContent = `${text} | Geheimes Wort: ${result?.word || '-'}`;
  }
  if (appState.roomState?.roundNumber) {
    els.roundDisplay.textContent = appState.roomState.roundNumber;
  }
  updateCanvasOverlay();
}

function renderState() {
  if (!appState.roomState) return;
  els.roomCodeDisplay.textContent = appState.roomCode || '----';
  els.lobbyRoomCode.textContent = appState.roomCode || '----';
  setStatus(phaseStatusText());
  renderLegend();
  renderPlayers();
  renderLobbyPlayers();
  renderVoteCards();
  updateRolePanel();
  updatePhasePanels();

  const phase = appState.roomState.phase;
  if (phase === 'lobby') {
    showView('lobby');
  } else {
    showView('game');
  }
}

function joinSuccess(roomCode, playerId) {
  appState.roomCode = roomCode;
  appState.myId = playerId;
  setCreateError('');
  setJoinError('');
  socket.emit('requestCanvasSync');
}

function tryCreateRoom() {
  ensureAudio();
  const nickname = sanitizeNickname(els.createNicknameInput.value);
  if (!nickname) {
    setCreateError('Bitte gib einen Nickname ein.');
    return;
  }
  socket.emit('createRoom', { nickname });
}

function tryJoinRoom() {
  ensureAudio();
  const nickname = sanitizeNickname(els.joinNicknameInput.value);
  const roomCode = sanitizeCode(els.joinRoomInput.value);
  if (!nickname || roomCode.length !== 4) {
    setJoinError('Bitte Nickname und 4-stelligen Code eingeben.');
    return;
  }
  socket.emit('joinRoom', { nickname, roomCode });
}

function copyInviteLink() {
  if (!appState.roomCode) return;
  const url = `${window.location.origin}${window.location.pathname}?room=${appState.roomCode}`;
  navigator.clipboard.writeText(url).then(() => {
    setStatus('Invite Link kopiert.');
  }).catch(() => {
    setStatus(url);
  });
}

function leaveRoom() {
  socket.emit('leaveRoom');
  appState.roomCode = null;
  appState.roomState = null;
  appState.strokes = [];
  appState.myVoteTarget = null;
  clearTimer();
  showView('landing');
}

function attachCanvasInput() {
  const onDown = (event) => {
    ensureAudio();
    if (!canDraw()) return;
    event.preventDefault();
    appState.pointerDown = true;
    sendPoint(event, true);
  };
  const onMove = (event) => {
    if (!appState.pointerDown || !canDraw()) return;
    event.preventDefault();
    sendPoint(event, false);
  };
  const onUp = () => {
    if (!appState.pointerDown) return;
    appState.pointerDown = false;
    socket.emit('strokeEnd');
  };
  els.canvas.addEventListener('pointerdown', onDown);
  els.canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  els.canvas.addEventListener('pointercancel', onUp);
  els.canvas.addEventListener('pointerleave', (event) => {
    if (appState.pointerDown) onMove(event);
  });
}

function bindEvents() {
  els.joinRoomInput.addEventListener('input', () => {
    els.joinRoomInput.value = sanitizeCode(els.joinRoomInput.value);
  });
  els.createRoomBtn.addEventListener('click', tryCreateRoom);
  els.joinRoomBtn.addEventListener('click', tryJoinRoom);
  els.lobbyInviteBtn.addEventListener('click', copyInviteLink);
  els.inviteBtn.addEventListener('click', copyInviteLink);
  els.lobbyStartBtn.addEventListener('click', () => {
    ensureAudio();
    socket.emit('startGame');
  });
  els.startBtn.addEventListener('click', () => {
    ensureAudio();
    socket.emit('startGame');
  });
  els.playAgainBtn.addEventListener('click', () => {
    ensureAudio();
    socket.emit('playAgain');
  });
  els.lobbyLeaveBtn.addEventListener('click', leaveRoom);
  els.leaveGameBtn.addEventListener('click', leaveRoom);
  els.submitGuessBtn.addEventListener('click', () => {
    ensureAudio();
    const guess = els.guessInput.value.trim();
    if (!guess) return;
    socket.emit('submitImposterGuess', { guess });
    els.guessInput.value = '';
  });
  els.guessInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      els.submitGuessBtn.click();
    }
  });
  // Enter key to submit forms
  els.createNicknameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); tryCreateRoom(); }
  });
  els.joinNicknameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); tryJoinRoom(); }
  });
  els.joinRoomInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); tryJoinRoom(); }
  });
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = sanitizeCode(params.get('room') || '');
  if (roomFromUrl.length === 4) {
    els.joinRoomInput.value = roomFromUrl;
    els.joinNicknameInput.focus();
  } else {
    els.createNicknameInput.focus();
  }
  attachCanvasInput();
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

socket.on('connect', () => {
  els.connectionDot.textContent = 'Online';
  els.connectionDot.className = 'px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/70 text-xs uppercase tracking-wider text-emerald-200 font-mono';
});

socket.on('disconnect', () => {
  els.connectionDot.textContent = 'Offline';
  els.connectionDot.className = 'px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/70 text-xs uppercase tracking-wider text-rose-200 font-mono';
});

socket.on('joinedRoom', ({ roomCode, playerId }) => {
  joinSuccess(roomCode, playerId);
});

socket.on('leftRoom', () => {
  showView('landing');
});

socket.on('roomState', (roomState) => {
  appState.roomState = roomState;
  renderState();
});

socket.on('roleInfo', (roleInfo) => {
  appState.roleInfo = roleInfo;
  updateRolePanel();
});

socket.on('drawPoint', (stroke) => {
  appState.strokes.push(stroke);
  drawStroke(stroke);
});

socket.on('canvasReset', () => {
  appState.strokes = [];
  clearCanvas();
});

socket.on('canvasSnapshot', (strokes) => {
  appState.strokes = Array.isArray(strokes) ? strokes : [];
  redrawAllStrokes();
});

socket.on('phaseChanged', ({ phase }) => {
  playGong();
  vibrate([50, 30, 50]);
  if (phase === 'drawing') {
    appState.myVoteTarget = null;
  }
});

socket.on('turnAdvanced', () => {
  vibrate(15);
});

socket.on('systemMessage', (message) => {
  setStatus(message);
});

socket.on('errorMessage', (message) => {
  if (appState.currentView === 'landing') {
    if (appState.roomCode) {
      setStatus(message);
    } else {
      setCreateError(message);
      setJoinError(message);
    }
  } else {
    setStatus(message);
  }
});

bindEvents();
