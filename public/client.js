const socket = io();

const els = {
  lobbyPanel: document.getElementById('lobbyPanel'),
  gamePanel: document.getElementById('gamePanel'),
  nicknameInput: document.getElementById('nicknameInput'),
  roomInput: document.getElementById('roomInput'),
  createBtn: document.getElementById('createBtn'),
  joinBtn: document.getElementById('joinBtn'),
  lobbyError: document.getElementById('lobbyError'),
  roomCodeLabel: document.getElementById('roomCodeLabel'),
  inviteBtn: document.getElementById('inviteBtn'),
  startBtn: document.getElementById('startBtn'),
  playAgainBtn: document.getElementById('playAgainBtn'),
  rolePanel: document.getElementById('rolePanel'),
  playersList: document.getElementById('playersList'),
  statusPanel: document.getElementById('statusPanel'),
  timerLabel: document.getElementById('timerLabel'),
  timerText: document.getElementById('timerText'),
  timerWrap: document.getElementById('timerWrap'),
  timerBar: document.getElementById('timerBar'),
  drawCanvas: document.getElementById('drawCanvas'),
  guessPanel: document.getElementById('guessPanel'),
  guessInput: document.getElementById('guessInput'),
  guessBtn: document.getElementById('guessBtn')
};

const ctx = els.drawCanvas.getContext('2d');
let dpr = window.devicePixelRatio || 1;
let roomCode = '';
let me = {
  id: null,
  role: null,
  category: null,
  word: null
};
let state = {
  phase: 'lobby',
  players: [],
  hostId: null,
  activePlayerId: null,
  canDraw: false,
  votedFor: null,
  replayEvents: []
};
let isPointerDown = false;
let timerAnim = null;
let tickSoundMarks = new Set();
let audioCtx = null;
let currentTimerKind = null;
const lastPoints = new Map();

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playTone({ freq, duration, type = 'sine', gain = 0.06 }) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.value = gain;
  osc.connect(amp);
  amp.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.start(now);
  osc.stop(now + duration);
}

function playPop() {
  playTone({ freq: 520 + Math.random() * 70, duration: 0.06, type: 'triangle', gain: 0.03 });
}

function playUrgentTick() {
  playTone({ freq: 950, duration: 0.08, type: 'square', gain: 0.05 });
}

function playGong() {
  playTone({ freq: 250, duration: 0.3, type: 'triangle', gain: 0.08 });
  setTimeout(() => playTone({ freq: 390, duration: 0.35, type: 'sine', gain: 0.06 }), 80);
}

function setStatus(text) {
  els.statusPanel.textContent = text;
}

function updateRolePanel() {
  const badge = me.role === 'imposter'
    ? '<span class="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 border border-rose-400/40 neon-rose">DU BIST DER IMPOSTER!</span>'
    : '<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 border border-emerald-400/40 neon-emerald">Rolle: Artist</span>';

  const secret = me.role === 'imposter'
    ? '<span class="text-slate-300">Geheimes Wort: <strong class="text-rose-300">VERBORGEN</strong></span>'
    : `<span class="text-slate-300">Geheimes Wort: <strong class="text-cyan-300">${me.word || '-'}</strong></span>`;

  els.rolePanel.innerHTML = `
    <span class="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700">Kategorie: ${me.category || '-'}</span>
    ${badge}
    ${secret}
  `;
}

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  const rect = els.drawCanvas.getBoundingClientRect();
  els.drawCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  els.drawCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  redrawReplay();
}

function clearCanvas() {
  const rect = els.drawCanvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  lastPoints.clear();
}

function drawNormalizedPoint(point) {
  const rect = els.drawCanvas.getBoundingClientRect();
  const x = point.x * rect.width;
  const y = point.y * rect.height;

  ctx.strokeStyle = point.color;
  ctx.fillStyle = point.color;

  if (point.isNewStroke || !lastPoints.has(point.playerId)) {
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const prev = lastPoints.get(point.playerId);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  lastPoints.set(point.playerId, { x, y });
}

function redrawReplay() {
  clearCanvas();
  state.replayEvents.forEach((event) => drawNormalizedPoint(event));
}

function normalizePointFromEvent(evt) {
  const rect = els.drawCanvas.getBoundingClientRect();
  const x = (evt.clientX - rect.left) / rect.width;
  const y = (evt.clientY - rect.top) / rect.height;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y))
  };
}

function updatePlayersList() {
  els.playersList.innerHTML = '';
  state.players.forEach((player) => {
    const isMe = player.id === me.id;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'w-full text-left p-3 rounded-xl border border-slate-700 bg-slate-900/70 transition hover:border-cyan-400/40';

    if (state.phase === 'voting') {
      card.classList.add('cursor-pointer');
      if (state.votedFor === player.id) {
        card.classList.add('neon-cyan');
      }
      card.onclick = () => {
        state.votedFor = player.id;
        socket.emit('cast_vote', { targetId: player.id });
        updatePlayersList();
      };
    } else {
      card.classList.add('cursor-default');
      card.onclick = null;
    }

    const roleText = player.role ? (player.role === 'imposter' ? 'Imposter' : 'Artist') : '???';
    const hostText = player.isHost ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/40">Host</span>' : '';

    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="font-semibold ${isMe ? 'text-cyan-300' : 'text-slate-100'}">${player.nickname} ${isMe ? '(Du)' : ''}</div>
          <div class="text-xs text-slate-400">Punkte: ${player.score} · Rolle: ${roleText}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded-full border border-slate-400/70" style="background:${player.color}"></span>
          ${hostText}
        </div>
      </div>
    `;

    if (state.activePlayerId === player.id && state.phase === 'drawing') {
      card.classList.add('neon-emerald');
    }

    els.playersList.appendChild(card);
  });
}

function startTimer({ durationMs, endAt, label, kind }) {
  currentTimerKind = kind;
  tickSoundMarks = new Set();

  if (timerAnim) cancelAnimationFrame(timerAnim);
  els.timerLabel.textContent = label;

  const loop = () => {
    const now = Date.now();
    const remaining = Math.max(0, endAt - now);
    const progress = 1 - remaining / durationMs;
    const pct = Math.max(0, Math.min(100, progress * 100));
    els.timerBar.style.width = `${pct}%`;

    const color = remaining > durationMs * 0.66
      ? '#34d399'
      : remaining > durationMs * 0.33
        ? '#fbbf24'
        : '#f87171';
    els.timerBar.style.backgroundColor = color;

    if (remaining <= 3000) {
      els.timerWrap.classList.add('pulse');
      const sec = Math.ceil(remaining / 1000);
      if (kind === 'turn' && sec > 0 && !tickSoundMarks.has(sec)) {
        tickSoundMarks.add(sec);
        playUrgentTick();
      }
    } else {
      els.timerWrap.classList.remove('pulse');
    }

    els.timerText.textContent = `${(remaining / 1000).toFixed(1)}s`;

    if (remaining > 0) {
      timerAnim = requestAnimationFrame(loop);
    } else {
      els.timerWrap.classList.remove('pulse');
      currentTimerKind = null;
    }
  };

  timerAnim = requestAnimationFrame(loop);
}

function setDrawingAvailability() {
  state.canDraw = state.phase === 'drawing' && state.activePlayerId === me.id;
  if (state.canDraw) {
    setStatus('Du bist dran – setze den ersten Strich, dann laufen 3 Sekunden.');
  }
}

function updateButtons() {
  const amHost = state.hostId === me.id;
  const enoughPlayers = state.players.length >= 3;

  els.startBtn.disabled = !(amHost && state.phase === 'lobby' && enoughPlayers);
  els.startBtn.classList.toggle('opacity-40', els.startBtn.disabled);

  const showPlayAgain = state.phase === 'result';
  els.playAgainBtn.classList.toggle('hidden', !showPlayAgain);
}

els.createBtn.addEventListener('click', () => {
  initAudio();
  socket.emit('join_room', {
    nickname: els.nicknameInput.value,
    roomCode: ''
  });
});

els.joinBtn.addEventListener('click', () => {
  initAudio();
  socket.emit('join_room', {
    nickname: els.nicknameInput.value,
    roomCode: els.roomInput.value
  });
});

els.inviteBtn.addEventListener('click', async () => {
  const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  try {
    await navigator.clipboard.writeText(url);
    setStatus('Invite Link kopiert.');
  } catch {
    setStatus(`Invite Link: ${url}`);
  }
});

els.startBtn.addEventListener('click', () => {
  initAudio();
  socket.emit('start_game');
});

els.playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setStatus('Play Again angefragt...');
});

els.guessBtn.addEventListener('click', () => {
  socket.emit('submit_guess', { guess: els.guessInput.value });
  els.guessInput.value = '';
});

els.drawCanvas.addEventListener('pointerdown', (evt) => {
  initAudio();
  if (!state.canDraw) return;

  isPointerDown = true;
  const point = normalizePointFromEvent(evt);
  socket.emit('drawing_point', { ...point, isNewStroke: true });
  playPop();
});

els.drawCanvas.addEventListener('pointermove', (evt) => {
  if (!isPointerDown || !state.canDraw) return;
  const point = normalizePointFromEvent(evt);
  socket.emit('drawing_point', { ...point, isNewStroke: false });
  playPop();
});

function releasePointer() {
  if (!isPointerDown) return;
  isPointerDown = false;
  if (state.canDraw) socket.emit('stroke_end');
}

els.drawCanvas.addEventListener('pointerup', releasePointer);
els.drawCanvas.addEventListener('pointercancel', releasePointer);
els.drawCanvas.addEventListener('pointerleave', () => {
  if (isPointerDown && state.canDraw) {
    socket.emit('stroke_end');
    isPointerDown = false;
  }
});

socket.on('connect', () => {
  me.id = socket.id;
});

socket.on('join_error', ({ message }) => {
  els.lobbyError.textContent = message;
});

socket.on('room_joined', ({ code, hostId }) => {
  roomCode = code;
  state.hostId = hostId;
  els.roomCodeLabel.textContent = code;
  els.lobbyPanel.classList.add('hidden');
  els.gamePanel.classList.remove('hidden');
  els.lobbyError.textContent = '';

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('room', code);
  window.history.replaceState({}, '', nextUrl);

  setStatus('Raum beigetreten. Warte auf den Host.');
  updateButtons();
});

socket.on('host_changed', ({ hostId }) => {
  state.hostId = hostId;
  updateButtons();
  updatePlayersList();
});

socket.on('room_state', ({ phase, players, playAgainVotes, replayEvents }) => {
  state.phase = phase;
  state.players = players;
  state.replayEvents = replayEvents || [];
  updatePlayersList();
  updateButtons();
  redrawReplay();

  if (phase === 'result') {
    setStatus(`Runde beendet. Play Again Votes: ${playAgainVotes}/${players.length}`);
  }
});

socket.on('role_info', ({ role, category, word, warning }) => {
  me.role = role;
  me.category = category;
  me.word = word;
  updateRolePanel();

  if (warning) {
    setStatus(warning);
  }
});

socket.on('phase_change', ({ phase, message }) => {
  state.phase = phase;
  state.votedFor = null;
  setDrawingAvailability();
  updateButtons();
  updatePlayersList();
  setStatus(message);
  playGong();

  const showGuess = phase === 'guessing' && me.role === 'imposter';
  els.guessPanel.classList.toggle('hidden', !showGuess);
});

socket.on('turn_started', ({ activePlayerId, round, currentTurn, totalTurns }) => {
  state.activePlayerId = activePlayerId;
  setDrawingAvailability();
  updatePlayersList();
  const activePlayer = state.players.find((p) => p.id === activePlayerId);
  setStatus(`Runde ${round}/2 · Zug ${currentTurn}/${totalTurns}: ${activePlayer?.nickname || 'Spieler'} ist aktiv.`);
});

socket.on('turn_ended', ({ reason }) => {
  if (reason === 'player_left') {
    setStatus('Aktiver Spieler hat verlassen. Nächster Zug startet.');
  }
});

socket.on('timer_started', (payload) => {
  startTimer(payload);
});

socket.on('drawing_point', (point) => {
  state.replayEvents.push(point);
  drawNormalizedPoint(point);
});

socket.on('vote_update', ({ votedPlayers }) => {
  setStatus(`Votes eingegangen: ${votedPlayers.length}/${state.players.length}`);
});

socket.on('showdown_result', ({ title, subtitle, secretWord, imposterId }) => {
  state.phase = 'result';
  updateButtons();
  updatePlayersList();
  const imposterName = state.players.find((p) => p.id === imposterId)?.nickname || 'Unbekannt';
  setStatus(`${title} — ${subtitle} | Wort: ${secretWord} | Imposter: ${imposterName}`);
  els.guessPanel.classList.add('hidden');
  playGong();
});

socket.on('reset_canvas', () => {
  state.replayEvents = [];
  clearCanvas();
  setStatus('Neue Runde gestartet.');
});

window.addEventListener('resize', resizeCanvas);
window.addEventListener('pointerdown', initAudio, { once: true });

const roomFromUrl = new URL(window.location.href).searchParams.get('room');
if (roomFromUrl) {
  els.roomInput.value = roomFromUrl.slice(0, 4);
}

resizeCanvas();
updateRolePanel();
setStatus('Willkommen bei SABOTAGE CANVAS.');
