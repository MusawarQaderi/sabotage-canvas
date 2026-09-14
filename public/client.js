const socket = io();

const els = {
  connectionDot: document.getElementById('connectionDot'),
  lobbyPanel: document.getElementById('lobbyPanel'),
  gamePanel: document.getElementById('gamePanel'),
  nicknameInput: document.getElementById('nicknameInput'),
  roomInput: document.getElementById('roomInput'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  lobbyError: document.getElementById('lobbyError'),
  roomCodeDisplay: document.getElementById('roomCodeDisplay'),
  inviteBtn: document.getElementById('inviteBtn'),
  startBtn: document.getElementById('startBtn'),
  playAgainBtn: document.getElementById('playAgainBtn'),
  timerLabel: document.getElementById('timerLabel'),
  timerValue: document.getElementById('timerValue'),
  timerBar: document.getElementById('timerBar'),
  statusLine: document.getElementById('statusLine'),
  legend: document.getElementById('legend'),
  categoryText: document.getElementById('categoryText'),
  wordText: document.getElementById('wordText'),
  imposterBadge: document.getElementById('imposterBadge'),
  playersList: document.getElementById('playersList'),
  votePanel: document.getElementById('votePanel'),
  voteCards: document.getElementById('voteCards'),
  showdownPanel: document.getElementById('showdownPanel'),
  showdownText: document.getElementById('showdownText'),
  guessWrap: document.getElementById('guessWrap'),
  guessInput: document.getElementById('guessInput'),
  submitGuessBtn: document.getElementById('submitGuessBtn'),
  canvas: document.getElementById('gameCanvas')
};

const ctx = els.canvas.getContext('2d');
const appState = {
  myId: null,
  roomCode: null,
  roomState: null,
  roleInfo: { category: null, word: null, isImposter: false },
  strokes: [],
  pointerDown: false,
  myVoteTarget: null,
  timerMode: null,
  timerEndsAt: null,
  timerTotalMs: null,
  timerInterval: null,
  timerLastTickSecond: null,
  cssWidth: 0,
  cssHeight: 0
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

function sanitizeCode(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 4);
}

function sanitizeNickname(value) {
  return String(value || '').trim().slice(0, 20);
}

function setLobbyError(message) {
  els.lobbyError.textContent = message || '';
}

function setStatus(message) {
  els.statusLine.textContent = message;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  for (const stroke of appState.strokes) drawStroke(stroke);
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
        <div class="text-xs text-slate-300">${player.score} pts</div>
      </div>
      <div class="mt-1 text-[11px] ${player.isHost ? 'text-amber-300' : 'text-slate-400'}">${player.isHost ? 'HOST' : active ? 'AKTIVER ZUG' : 'SPIELER'}</div>
    `;
    els.playersList.appendChild(card);
  }
}

function renderVoteCards() {
  const players = appState.roomState?.players || [];
  const voteCounts = new Map((appState.roomState?.voteCounts || []).map((entry) => [entry.targetId, entry.count]));
  els.voteCards.innerHTML = '';

  for (const player of players) {
    const btn = document.createElement('button');
    const selected = appState.myVoteTarget === player.id;
    btn.className = `w-full text-left rounded-xl border px-3 py-2 ${selected ? 'border-rose-400/70 bg-rose-500/15 shadow-neonRose' : 'border-slate-700 bg-slate-900/70 hover:border-rose-400/50'}`;
    btn.innerHTML = `
      <div class="flex items-center justify-between">
        <span><span class="inline-block w-2.5 h-2.5 rounded-full mr-2" style="background:${player.color}"></span>${player.nickname}</span>
        <span class="text-xs text-slate-300">${voteCounts.get(player.id) || 0} Votes</span>
      </div>
    `;
    btn.addEventListener('click', () => {
      if (appState.roomState?.phase !== 'voting') return;
      appState.myVoteTarget = player.id;
      socket.emit('castVote', { targetId: player.id });
      renderVoteCards();
    });
    els.voteCards.appendChild(btn);
  }
}

function updateRolePanel() {
  const role = appState.roleInfo;
  els.categoryText.textContent = role.category || '-';
  els.wordText.textContent = role.isImposter ? '???' : role.word || '-';
  els.imposterBadge.classList.toggle('hidden', !role.isImposter || appState.roomState?.phase === 'lobby');
}

function phaseStatusText() {
  const phase = appState.roomState?.phase;
  if (!phase) return 'Warte auf Verbindung...';

  if (phase === 'lobby') {
    return `Lobby: ${appState.roomState.players.length}/${appState.roomState.minPlayers} Spieler`;
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
    if (result.outcome === 'imposter_victory') return 'Imposter Victory Screen: Der Imposter hat euch ausgetrickst!';
    if (result.outcome === 'heist_win') return 'Heist Win: Der Imposter hat das geheime Wort erraten!';
    return 'Artists Win: Der Imposter wurde gestoppt!';
  }

  return 'Spielstatus wird synchronisiert...';
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
    if (result?.outcome === 'imposter_victory') text = 'Imposter Victory Screen';
    if (result?.outcome === 'heist_win') text = 'Heist Win';
    if (result?.outcome === 'artists_win') text = 'Artists Win';
    els.showdownText.textContent = `${text} | Geheimes Wort: ${result?.word || '-'}`;
  }
}

function renderState() {
  if (!appState.roomState) return;

  els.roomCodeDisplay.textContent = appState.roomCode || '----';
  setStatus(phaseStatusText());
  renderLegend();
  renderPlayers();
  renderVoteCards();
  updateRolePanel();
  updatePhasePanels();
}

function joinSuccess(roomCode, playerId) {
  appState.roomCode = roomCode;
  appState.myId = playerId;
  els.lobbyPanel.classList.add('hidden');
  els.gamePanel.classList.remove('hidden');
  setLobbyError('');
  socket.emit('requestCanvasSync');
}

function tryCreateRoom() {
  ensureAudio();
  const nickname = sanitizeNickname(els.nicknameInput.value);
  if (!nickname) {
    setLobbyError('Bitte gib einen Nickname ein.');
    return;
  }
  socket.emit('createRoom', { nickname });
}

function tryJoinRoom() {
  ensureAudio();
  const nickname = sanitizeNickname(els.nicknameInput.value);
  const roomCode = sanitizeCode(els.roomInput.value);
  if (!nickname || roomCode.length !== 4) {
    setLobbyError('Bitte Nickname und 4-stelligen Code eingeben.');
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
  els.roomInput.addEventListener('input', () => {
    els.roomInput.value = sanitizeCode(els.roomInput.value);
  });

  els.createRoomBtn.addEventListener('click', tryCreateRoom);
  els.joinRoomBtn.addEventListener('click', tryJoinRoom);
  els.inviteBtn.addEventListener('click', copyInviteLink);

  els.startBtn.addEventListener('click', () => {
    ensureAudio();
    socket.emit('startGame');
  });

  els.playAgainBtn.addEventListener('click', () => {
    ensureAudio();
    socket.emit('playAgain');
  });

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

  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = sanitizeCode(params.get('room') || '');
  if (roomFromUrl.length === 4) els.roomInput.value = roomFromUrl;

  attachCanvasInput();
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

socket.on('connect', () => {
  els.connectionDot.textContent = 'Online';
  els.connectionDot.className = 'px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/70 text-xs uppercase tracking-wider text-emerald-200';
});

socket.on('disconnect', () => {
  els.connectionDot.textContent = 'Offline';
  els.connectionDot.className = 'px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/70 text-xs uppercase tracking-wider text-rose-200';
});

socket.on('joinedRoom', ({ roomCode, playerId }) => {
  joinSuccess(roomCode, playerId);
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

socket.on('phaseChanged', () => {
  playGong();
});

socket.on('systemMessage', (message) => {
  setStatus(message);
});

socket.on('errorMessage', (message) => {
  if (!appState.roomCode) setLobbyError(message);
  else setStatus(message);
});

bindEvents();
