const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const MIN_PLAYERS = 3;
const TURN_MS = 3000;
const VOTING_MS = 30000;
const GUESS_MS = 15000;
const TOTAL_ROUNDS = 2;

const COLOR_PALETTE = ['#06b6d4', '#f43f5e', '#10b981', '#f59e0b', '#a855f7', '#22d3ee', '#fb7185', '#34d399'];

const WORD_POOL = [
  { category: 'Tiere', word: 'Giraffe' },
  { category: 'Tiere', word: 'Delfin' },
  { category: 'Tiere', word: 'Eule' },
  { category: 'Tiere', word: 'Chamäleon' },
  { category: 'Tiere', word: 'Pinguin' },
  { category: 'Fahrzeuge', word: 'Bagger' },
  { category: 'Fahrzeuge', word: 'U-Boot' },
  { category: 'Fahrzeuge', word: 'Heißluftballon' },
  { category: 'Fahrzeuge', word: 'Rakete' },
  { category: 'Fahrzeuge', word: 'Feuerwehrauto' },
  { category: 'Essen', word: 'Sushi' },
  { category: 'Essen', word: 'Burger' },
  { category: 'Essen', word: 'Brezel' },
  { category: 'Essen', word: 'Croissant' },
  { category: 'Essen', word: 'Taco' },
  { category: 'Berufe', word: 'Astronaut' },
  { category: 'Berufe', word: 'Detektiv' },
  { category: 'Berufe', word: 'Koch' },
  { category: 'Berufe', word: 'Pilot' },
  { category: 'Berufe', word: 'Feuerwehrmann' },
  { category: 'Orte', word: 'Leuchtturm' },
  { category: 'Orte', word: 'Pyramide' },
  { category: 'Orte', word: 'Skigebiet' },
  { category: 'Orte', word: 'Bibliothek' },
  { category: 'Orte', word: 'Aquarium' },
  { category: 'Objekte', word: 'Kompass' },
  { category: 'Objekte', word: 'Regenschirm' },
  { category: 'Objekte', word: 'Sanduhr' },
  { category: 'Objekte', word: 'Teleskop' },
  { category: 'Objekte', word: 'Schlüssel' }
];

const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function sanitizeNickname(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}_\- ]/gu, '')
    .trim()
    .slice(0, 18);
}

function createRoom(code, hostId) {
  return {
    code,
    hostId,
    phase: 'lobby',
    players: [],
    usedWords: new Set(),
    secret: null,
    imposterId: null,
    turnIndex: 0,
    turnTimerStarted: false,
    votes: {},
    replayEvents: [],
    playAgainVotes: new Set(),
    timeouts: { turn: null, voting: null, guessing: null },
    revealed: false
  };
}

function clearTimers(room) {
  Object.keys(room.timeouts).forEach((key) => {
    if (room.timeouts[key]) {
      clearTimeout(room.timeouts[key]);
      room.timeouts[key] = null;
    }
  });
}

function getPublicPlayers(room, revealRoles = false) {
  return room.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    color: p.color,
    score: p.score,
    isHost: room.hostId === p.id,
    role: revealRoles ? p.role : null,
    connected: true
  }));
}

function emitRoomState(room) {
  io.to(room.code).emit('room_state', {
    code: room.code,
    phase: room.phase,
    minPlayers: MIN_PLAYERS,
    players: getPublicPlayers(room, room.revealed),
    playAgainVotes: room.playAgainVotes.size,
    replayEvents: room.replayEvents
  });
}

function getTurnContext(room) {
  const totalTurns = room.players.length * TOTAL_ROUNDS;
  return {
    totalTurns,
    currentTurn: room.turnIndex + 1,
    round: Math.floor(room.turnIndex / room.players.length) + 1,
    turnInRound: (room.turnIndex % room.players.length) + 1
  };
}

function emitTimer(room, durationMs, label, kind) {
  const endAt = Date.now() + durationMs;
  io.to(room.code).emit('timer_started', { durationMs, endAt, label, kind });
}

function beginTurn(room) {
  if (room.players.length < MIN_PLAYERS) {
    room.phase = 'lobby';
    room.revealed = false;
    emitRoomState(room);
    return;
  }

  if (room.turnIndex >= room.players.length * TOTAL_ROUNDS) {
    startVoting(room);
    return;
  }

  room.phase = 'drawing';
  room.turnTimerStarted = false;

  const active = room.players[room.turnIndex % room.players.length];
  io.to(room.code).emit('turn_started', {
    activePlayerId: active.id,
    ...getTurnContext(room)
  });
  emitRoomState(room);
}

function endTurn(room, reason) {
  if (room.phase !== 'drawing') {
    return;
  }
  if (room.timeouts.turn) {
    clearTimeout(room.timeouts.turn);
    room.timeouts.turn = null;
  }
  io.to(room.code).emit('turn_ended', { reason });
  room.turnIndex += 1;
  beginTurn(room);
}

function normalizeText(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function isGuessCorrect(guess, secretWord) {
  const normalizedGuess = normalizeText(guess);
  const normalizedSecret = normalizeText(secretWord);
  if (!normalizedGuess || !normalizedSecret) return false;
  if (normalizedGuess === normalizedSecret) return true;
  const distance = levenshtein(normalizedGuess, normalizedSecret);
  return distance <= Math.max(1, Math.floor(normalizedSecret.length * 0.2));
}

function finishWithResult(room, result) {
  clearTimers(room);
  room.phase = 'result';
  room.revealed = true;

  if (result.winner === 'imposter') {
    const imp = room.players.find((p) => p.id === room.imposterId);
    if (imp) imp.score += 2;
  }
  if (result.winner === 'artists') {
    room.players.forEach((p) => {
      if (p.id !== room.imposterId) {
        p.score += 1;
      }
    });
  }

  io.to(room.code).emit('showdown_result', {
    ...result,
    secretWord: room.secret.word,
    category: room.secret.category,
    imposterId: room.imposterId
  });

  room.playAgainVotes.clear();
  emitRoomState(room);
}

function startGuessing(room) {
  room.phase = 'guessing';
  emitTimer(room, GUESS_MS, 'Imposter Guess', 'guessing');
  io.to(room.code).emit('phase_change', { phase: room.phase, message: 'Imposter wurde enttarnt! Rate jetzt das Wort.' });
  room.timeouts.guessing = setTimeout(() => {
    finishWithResult(room, {
      winner: 'artists',
      title: 'Artists Win',
      subtitle: 'Der Imposter hat das geheime Wort nicht rechtzeitig erraten.'
    });
  }, GUESS_MS);
  emitRoomState(room);
}

function concludeVoting(room) {
  if (room.phase !== 'voting') return;
  if (room.timeouts.voting) {
    clearTimeout(room.timeouts.voting);
    room.timeouts.voting = null;
  }

  const tally = {};
  Object.values(room.votes).forEach((targetId) => {
    tally[targetId] = (tally[targetId] || 0) + 1;
  });

  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const topVotes = entries[0]?.[1] || 0;
  const topTargets = entries.filter((entry) => entry[1] === topVotes);

  if (topVotes === 0 || topTargets.length !== 1) {
    finishWithResult(room, {
      winner: 'imposter',
      title: 'Imposter Victory Screen',
      subtitle: 'Keine klare Mehrheit – der Imposter entkommt im Chaos.'
    });
    return;
  }

  const votedOutId = topTargets[0][0];
  if (votedOutId !== room.imposterId) {
    finishWithResult(room, {
      winner: 'imposter',
      title: 'Imposter Victory Screen',
      subtitle: 'Mehrheit hat einen Unschuldigen gewählt.'
    });
    return;
  }

  io.to(room.code).emit('phase_change', { phase: 'guessing', message: 'Imposter korrekt erkannt! Finaler Showdown...' });
  startGuessing(room);
}

function startVoting(room) {
  room.phase = 'voting';
  room.votes = {};
  emitTimer(room, VOTING_MS, 'Voting', 'voting');
  io.to(room.code).emit('phase_change', { phase: room.phase, message: 'Voting gestartet: Wer ist der Imposter?' });
  room.timeouts.voting = setTimeout(() => {
    concludeVoting(room);
  }, VOTING_MS);
  emitRoomState(room);
}

function assignRoles(room) {
  const availableWords = WORD_POOL.filter((entry) => !room.usedWords.has(`${entry.category}:${entry.word}`));
  const source = availableWords.length ? availableWords : WORD_POOL;
  const picked = source[Math.floor(Math.random() * source.length)];

  room.secret = picked;
  room.usedWords.add(`${picked.category}:${picked.word}`);
  room.imposterId = room.players[Math.floor(Math.random() * room.players.length)].id;

  room.players.forEach((player) => {
    player.role = player.id === room.imposterId ? 'imposter' : 'artist';
  });
}

function startGame(room) {
  clearTimers(room);
  room.turnIndex = 0;
  room.turnTimerStarted = false;
  room.votes = {};
  room.replayEvents = [];
  room.revealed = false;
  room.playAgainVotes.clear();

  assignRoles(room);

  room.players.forEach((player) => {
    io.to(player.id).emit('role_info', {
      role: player.role,
      category: room.secret.category,
      word: player.role === 'imposter' ? null : room.secret.word,
      warning: player.role === 'imposter' ? 'DU BIST DER IMPOSTER!' : null
    });
  });

  io.to(room.code).emit('reset_canvas');
  io.to(room.code).emit('phase_change', { phase: 'drawing', message: 'Zeichnen startet! Der Timer beginnt beim ersten Strich.' });
  beginTurn(room);
}

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === socketId)) return room;
  }
  return null;
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ nickname, roomCode }) => {
    const safeName = sanitizeNickname(nickname);
    if (!safeName) {
      socket.emit('join_error', { message: 'Bitte gib einen gültigen Nickname ein.' });
      return;
    }

    const normalizedCode = String(roomCode || '').trim();
    if (normalizedCode && !/^\d{4}$/.test(normalizedCode)) {
      socket.emit('join_error', { message: 'Raumcode muss genau 4 Ziffern haben.' });
      return;
    }
    const code = normalizedCode || makeCode();

    let room = rooms.get(code);
    if (!room) {
      room = createRoom(code, socket.id);
      rooms.set(code, room);
    }

    if (room.phase !== 'lobby' && room.phase !== 'result') {
      socket.emit('join_error', { message: 'Das Spiel läuft bereits. Bitte warte auf eine neue Runde.' });
      return;
    }

    if (room.players.some((p) => p.nickname.toLowerCase() === safeName.toLowerCase())) {
      socket.emit('join_error', { message: 'Nickname ist bereits vergeben.' });
      return;
    }

    const player = {
      id: socket.id,
      nickname: safeName,
      color: COLOR_PALETTE[room.players.length % COLOR_PALETTE.length],
      role: null,
      score: 0
    };

    room.players.push(player);
    socket.join(code);
    socket.emit('room_joined', { code, hostId: room.hostId });

    emitRoomState(room);
    if (room.phase === 'result') {
      io.to(room.code).emit('phase_change', { phase: 'result', message: 'Runde beendet. Warte auf Play Again.' });
    }
  });

  socket.on('start_game', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit('join_error', { message: 'Nur der Host kann das Spiel starten.' });
      return;
    }

    if (room.players.length < MIN_PLAYERS) {
      socket.emit('join_error', { message: `Mindestens ${MIN_PLAYERS} Spieler benötigt.` });
      return;
    }

    startGame(room);
  });

  socket.on('drawing_point', ({ x, y, isNewStroke }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'drawing') return;

    const active = room.players[room.turnIndex % room.players.length];
    if (!active || active.id !== socket.id) return;

    const safeX = Number(x);
    const safeY = Number(y);
    if (!Number.isFinite(safeX) || !Number.isFinite(safeY)) return;

    const normalized = {
      x: Math.min(1, Math.max(0, safeX)),
      y: Math.min(1, Math.max(0, safeY)),
      isNewStroke: Boolean(isNewStroke),
      playerId: socket.id,
      color: active.color
    };

    room.replayEvents.push(normalized);

    if (!room.turnTimerStarted) {
      room.turnTimerStarted = true;
      emitTimer(room, TURN_MS, 'Turn', 'turn');
      room.timeouts.turn = setTimeout(() => {
        endTurn(room, 'timeout');
      }, TURN_MS);
    }

    io.to(room.code).emit('drawing_point', normalized);
  });

  socket.on('stroke_end', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'drawing') return;
    const active = room.players[room.turnIndex % room.players.length];
    if (!active || active.id !== socket.id || !room.turnTimerStarted) return;
    endTurn(room, 'released');
  });

  socket.on('cast_vote', ({ targetId }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'voting') return;
    if (!room.players.some((p) => p.id === targetId)) return;

    room.votes[socket.id] = targetId;
    io.to(room.code).emit('vote_update', {
      votedPlayers: Object.keys(room.votes)
    });

    if (Object.keys(room.votes).length >= room.players.length) {
      concludeVoting(room);
    }
  });

  socket.on('submit_guess', ({ guess }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'guessing') return;
    if (socket.id !== room.imposterId) return;

    if (room.timeouts.guessing) {
      clearTimeout(room.timeouts.guessing);
      room.timeouts.guessing = null;
    }

    if (isGuessCorrect(guess, room.secret.word)) {
      finishWithResult(room, {
        winner: 'imposter',
        title: 'Heist Win',
        subtitle: 'Der Imposter hat das geheime Wort erraten.'
      });
    } else {
      finishWithResult(room, {
        winner: 'artists',
        title: 'Artists Win',
        subtitle: 'Der Imposter lag mit dem Wort daneben.'
      });
    }
  });

  socket.on('play_again', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'result') return;

    room.playAgainVotes.add(socket.id);
    emitRoomState(room);

    if (room.playAgainVotes.size === room.players.length && room.players.length >= MIN_PLAYERS) {
      startGame(room);
    }
  });

  socket.on('disconnect', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    const leavingIndex = room.players.findIndex((p) => p.id === socket.id);
    if (leavingIndex === -1) return;

    const wasActive = room.phase === 'drawing' && room.players[room.turnIndex % room.players.length]?.id === socket.id;
    const wasHost = room.hostId === socket.id;
    const wasImposter = room.imposterId === socket.id;

    room.players.splice(leavingIndex, 1);
    room.playAgainVotes.delete(socket.id);
    delete room.votes[socket.id];
    Object.keys(room.votes).forEach((voterId) => {
      if (room.votes[voterId] === socket.id) {
        delete room.votes[voterId];
      }
    });

    if (!room.players.length) {
      clearTimers(room);
      rooms.delete(room.code);
      return;
    }

    if (wasHost) {
      room.hostId = room.players[0].id;
      io.to(room.code).emit('host_changed', { hostId: room.hostId });
    }

    if (room.players.length < MIN_PLAYERS && room.phase !== 'lobby') {
      finishWithResult(room, {
        winner: 'artists',
        title: 'Runde beendet',
        subtitle: 'Zu wenige Spieler. Neue Runde im Lobby-Modus.'
      });
      room.phase = 'lobby';
      room.revealed = false;
      emitRoomState(room);
      return;
    }

    if (room.phase === 'guessing' && wasImposter) {
      finishWithResult(room, {
        winner: 'artists',
        title: 'Artists Win',
        subtitle: 'Der Imposter hat das Spiel verlassen.'
      });
      return;
    }

    if (room.phase === 'drawing') {
      if (leavingIndex <= room.turnIndex % (room.players.length + 1)) {
        room.turnIndex = Math.max(0, room.turnIndex - 1);
      }
      if (wasActive) {
        endTurn(room, 'player_left');
      } else {
        emitRoomState(room);
      }
      return;
    }

    if (room.phase === 'voting' && Object.keys(room.votes).length >= room.players.length) {
      concludeVoting(room);
      return;
    }

    emitRoomState(room);
  });
});

server.listen(PORT, () => {
  console.log(`SABOTAGE CANVAS server listening on port ${PORT}`);
});
