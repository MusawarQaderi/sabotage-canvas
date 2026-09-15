const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const WORD_BANK = require('./words');

const PORT = process.env.PORT || 3000;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;
const DRAW_TURN_MS = 3000;
const VOTING_MS = 30000;
const SHOWDOWN_MS = 15000;

const COLORS = ['#06b6d4', '#f43f5e', '#10b981', '#f59e0b', '#a855f7', '#22d3ee', '#fb7185', '#34d399'];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const playerRoom = new Map();

function sanitizeNickname(input) {
  const value = String(input || '').trim().replace(/\s+/g, ' ');
  if (!value) return null;
  return value.slice(0, 20);
}

function normalizeGuess(input) {
  return String(input || '')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/g, ' ');
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function createRoomCode() {
  let code;
  do {
    code = String(randomInt(10000)).padStart(4, '0');
  } while (rooms.has(code));
  return code;
}

function clearTimers(room) {
  if (room.drawTimer) clearTimeout(room.drawTimer);
  if (room.voteTimer) clearTimeout(room.voteTimer);
  if (room.showdownTimer) clearTimeout(room.showdownTimer);
  room.drawTimer = null;
  room.voteTimer = null;
  room.showdownTimer = null;
}

function pickWord(room) {
  const available = WORD_BANK.filter((w) => !room.usedWords.has(w.word));
  if (available.length === 0) {
    room.usedWords.clear();
    return WORD_BANK[randomInt(WORD_BANK.length)];
  }
  return available[randomInt(available.length)];
}

function assignRoundSecrets(room) {
  const chosen = pickWord(room);
  room.category = chosen.category;
  room.word = chosen.word;
  room.hints = chosen.hints || [];
  room.usedWords.add(chosen.word);
  const imposter = room.players[randomInt(room.players.length)];
  room.imposterId = imposter.id;
}

function computeImposterHints(room) {
  const hintsRevealed = [];
  if (room.category) hintsRevealed.push(`Kategorie: ${room.category}`);
  if (room.phase === 'lobby') return [...new Set(hintsRevealed)];
  const round = room.roundNumber || 1;
  if (room.hints) {
    if (round >= 2 && room.hints[0]) hintsRevealed.push(room.hints[0]);
    if (room.phase === 'voting' || room.phase === 'showdown' || room.phase === 'ended') {
      if (room.hints[1]) hintsRevealed.push(room.hints[1]);
    }
    if (room.phase === 'showdown' || room.phase === 'ended') {
      if (room.hints[2]) hintsRevealed.push(room.hints[2]);
    }
  }
  return [...new Set(hintsRevealed)];
}

function baseRoomState(room) {
  return {
    roomCode: room.code,
    phase: room.phase,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    hostId: room.hostId,
    roundNumber: room.roundNumber,
    activePlayerId: room.activePlayerId,
    turnEndsAt: room.turnEndsAt,
    turnStartedAt: room.turnStartedAt,
    voteEndsAt: room.voteEndsAt,
    showdownEndsAt: room.showdownEndsAt,
    turnNumber: room.turnNumber,
    totalTurns: room.totalTurns,
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      color: p.color,
      score: p.score,
      isHost: p.id === room.hostId
    })),
    drawingLegend: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      color: p.color
    })),
    voteCounts: Object.entries(room.voteCounts || {}).map(([targetId, count]) => ({ targetId, count })),
    votesSubmitted: Object.keys(room.votes || {}).length,
    totalVotesExpected: room.players.length,
    result: room.result || null
  };
}

function emitRoleInfo(room) {
  for (const player of room.players) {
    const socket = io.sockets.sockets.get(player.id);
    if (!socket) continue;
    const isImposter = player.id === room.imposterId;
    const payload = {
      phase: room.phase,
      category: room.category || null,
      isImposter,
      word: isImposter ? null : room.word || null,
      imposterHints: isImposter ? computeImposterHints(room) : [],
      warning: isImposter && room.phase !== 'lobby' ? 'DU BIST DER IMPOSTER!' : null
    };
    socket.emit('roleInfo', payload);
  }
}

function emitRoomState(room) {
  io.to(room.code).emit('roomState', baseRoomState(room));
  emitRoleInfo(room);
}

function findRoomBySocketId(socketId) {
  const roomCode = playerRoom.get(socketId);
  if (!roomCode) return null;
  return rooms.get(roomCode) || null;
}

function recalcVoteCounts(room) {
  const counts = {};
  for (const targetId of Object.values(room.votes || {})) {
    counts[targetId] = (counts[targetId] || 0) + 1;
  }
  room.voteCounts = counts;
}

function beginVoting(room) {
  clearTimers(room);
  room.phase = 'voting';
  room.activePlayerId = null;
  room.turnEndsAt = null;
  room.turnStartedAt = null;
  room.votes = {};
  room.voteCounts = {};
  room.voteEndsAt = Date.now() + VOTING_MS;
  room.voteTimer = setTimeout(() => {
    concludeVoting(room);
  }, VOTING_MS);
  io.to(room.code).emit('phaseChanged', { phase: 'voting' });
  emitRoomState(room);
}

function advanceToNextTurn(room, reason) {
  if (room.phase !== 'drawing') return;
  clearTimeout(room.drawTimer);
  room.drawTimer = null;
  room.turnEndsAt = null;
  room.turnStartedAt = null;
  room.turnNumber += 1;
  if (room.turnNumber >= room.totalTurns) {
    beginVoting(room);
    return;
  }
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
  io.to(room.code).emit('turnAdvanced', { reason });
  activateTurn(room);
}

function activateTurn(room) {
  if (room.phase !== 'drawing') return;
  if (!room.turnOrder.length) {
    beginVoting(room);
    return;
  }
  const activeId = room.turnOrder[room.currentTurnIndex];
  if (!room.players.some((p) => p.id === activeId)) {
    room.turnOrder = room.turnOrder.filter((id) => room.players.some((p) => p.id === id));
    if (!room.turnOrder.length) {
      beginVoting(room);
      return;
    }
    room.currentTurnIndex = room.currentTurnIndex % room.turnOrder.length;
    activateTurn(room);
    return;
  }
  room.activePlayerId = activeId;
  room.turnStartedAt = null;
  room.turnEndsAt = null;
  emitRoomState(room);
}

function finishGame(room, outcome) {
  clearTimers(room);
  if (outcome === 'imposter_victory' || outcome === 'heist_win') {
    const imposter = room.players.find((p) => p.id === room.imposterId);
    if (imposter) imposter.score += outcome === 'heist_win' ? 3 : 2;
  } else if (outcome === 'artists_win') {
    for (const player of room.players) {
      if (player.id !== room.imposterId) player.score += 1;
    }
  }
  room.phase = 'ended';
  room.activePlayerId = null;
  room.turnEndsAt = null;
  room.turnStartedAt = null;
  room.voteEndsAt = null;
  room.showdownEndsAt = null;
  room.result = {
    outcome,
    imposterId: room.imposterId,
    word: room.word,
    category: room.category,
    votedOutId: room.votedOutId || null
  };
  io.to(room.code).emit('phaseChanged', { phase: 'ended', outcome });
  emitRoomState(room);
}

function beginShowdown(room) {
  clearTimers(room);
  room.phase = 'showdown';
  room.showdownEndsAt = Date.now() + SHOWDOWN_MS;
  room.showdownTimer = setTimeout(() => {
    finishGame(room, 'artists_win');
  }, SHOWDOWN_MS);
  io.to(room.code).emit('phaseChanged', { phase: 'showdown' });
  emitRoomState(room);
}

function concludeVoting(room) {
  if (room.phase !== 'voting') return;
  clearTimeout(room.voteTimer);
  room.voteTimer = null;
  recalcVoteCounts(room);
  const entries = Object.entries(room.voteCounts);
  entries.sort((a, b) => b[1] - a[1]);
  let votedOutId = null;
  if (entries.length) {
    const highest = entries[0][1];
    const tied = entries.filter((entry) => entry[1] === highest).length > 1;
    if (!tied) votedOutId = entries[0][0];
  }
  room.votedOutId = votedOutId;
  if (!votedOutId || votedOutId !== room.imposterId) {
    finishGame(room, 'imposter_victory');
    return;
  }
  beginShowdown(room);
}

function resetForLobby(room, reason) {
  clearTimers(room);
  room.phase = 'lobby';
  room.roundNumber = Math.max(room.roundNumber, 1);
  room.activePlayerId = null;
  room.turnOrder = [];
  room.currentTurnIndex = 0;
  room.turnNumber = 0;
  room.totalTurns = 0;
  room.turnEndsAt = null;
  room.turnStartedAt = null;
  room.voteEndsAt = null;
  room.showdownEndsAt = null;
  room.votes = {};
  room.voteCounts = {};
  room.result = null;
  room.category = null;
  room.word = null;
  room.hints = [];
  room.imposterId = null;
  room.votedOutId = null;
  room.strokes = [];
  if (reason) io.to(room.code).emit('systemMessage', reason);
  io.to(room.code).emit('canvasReset');
  emitRoomState(room);
}

function startMatch(room) {
  if (room.players.length < MIN_PLAYERS) return false;
  clearTimers(room);
  room.roundNumber += 1;
  room.phase = 'drawing';
  room.result = null;
  room.votedOutId = null;
  room.strokes = [];
  room.votes = {};
  room.voteCounts = {};
  room.voteEndsAt = null;
  room.showdownEndsAt = null;
  assignRoundSecrets(room);
  room.turnOrder = room.players.map((p) => p.id);
  room.currentTurnIndex = 0;
  room.turnNumber = 0;
  room.totalTurns = room.turnOrder.length * 2;
  io.to(room.code).emit('canvasReset');
  io.to(room.code).emit('phaseChanged', { phase: 'drawing' });
  activateTurn(room);
  return true;
}

function removePlayer(room, socketId) {
  const idx = room.players.findIndex((p) => p.id === socketId);
  if (idx === -1) return;
  const [removed] = room.players.splice(idx, 1);
  const wasHost = room.hostId === socketId;
  const wasActive = room.activePlayerId === socketId;
  const removedTurnOrderIndex = (room.turnOrder || []).indexOf(socketId);
  delete room.votes[socketId];
  recalcVoteCounts(room);
  if (wasHost && room.players.length) {
    room.hostId = room.players[0].id;
  }
  if (removedTurnOrderIndex !== -1 && removedTurnOrderIndex < room.currentTurnIndex) {
    room.currentTurnIndex = Math.max(0, room.currentTurnIndex - 1);
  }
  room.turnOrder = (room.turnOrder || []).filter((id) => id !== socketId);
  if (room.currentTurnIndex >= room.turnOrder.length) {
    room.currentTurnIndex = 0;
  }
  if (!room.players.length) {
    clearTimers(room);
    rooms.delete(room.code);
    return;
  }
  if (room.players.length < MIN_PLAYERS && room.phase !== 'lobby') {
    resetForLobby(room, 'Zu wenige Spieler. Das Spiel wurde in die Lobby zurückgesetzt.');
    return;
  }
  if (room.phase === 'drawing' && wasActive) {
    clearTimeout(room.drawTimer);
    room.drawTimer = null;
    room.turnStartedAt = null;
    room.turnEndsAt = null;
    room.turnNumber += 1;
    room.totalTurns = room.turnOrder.length * 2;
    if (room.turnNumber >= room.totalTurns) {
      beginVoting(room);
      return;
    }
    activateTurn(room);
    return;
  }
  if (room.phase === 'voting' && Object.keys(room.votes).length >= room.players.length) {
    concludeVoting(room);
    return;
  }
  if (room.phase === 'showdown' && removed.id === room.imposterId) {
    finishGame(room, 'artists_win');
    return;
  }
  emitRoomState(room);
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ nickname }) => {
    const cleanName = sanitizeNickname(nickname);
    if (!cleanName) {
      socket.emit('errorMessage', 'Bitte gib einen gültigen Nickname ein.');
      return;
    }
    const code = createRoomCode();
    const room = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, nickname: cleanName, color: COLORS[0], score: 0 }],
      phase: 'lobby',
      roundNumber: 0,
      activePlayerId: null,
      turnOrder: [],
      currentTurnIndex: 0,
      turnNumber: 0,
      totalTurns: 0,
      turnEndsAt: null,
      turnStartedAt: null,
      voteEndsAt: null,
      showdownEndsAt: null,
      drawTimer: null,
      voteTimer: null,
      showdownTimer: null,
      votes: {},
      voteCounts: {},
      result: null,
      strokes: [],
      category: null,
      word: null,
      hints: [],
      imposterId: null,
      votedOutId: null,
      usedWords: new Set()
    };
    rooms.set(code, room);
    playerRoom.set(socket.id, code);
    socket.join(code);
    socket.emit('joinedRoom', { roomCode: code, playerId: socket.id });
    emitRoomState(room);
  });

  socket.on('joinRoom', ({ nickname, roomCode }) => {
    const cleanName = sanitizeNickname(nickname);
    const code = String(roomCode || '').trim();
    if (!cleanName || !/^\d{4}$/.test(code)) {
      socket.emit('errorMessage', 'Ungültiger Name oder Raumcode.');
      return;
    }
    const room = rooms.get(code);
    if (!room) {
      socket.emit('errorMessage', 'Raum nicht gefunden.');
      return;
    }
    if (room.phase !== 'lobby') {
      socket.emit('errorMessage', 'Das Spiel läuft bereits. Bitte warte auf die nächste Runde.');
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('errorMessage', 'Der Raum ist voll (maximal 8 Spieler).');
      return;
    }
    if (room.players.some((p) => p.nickname.toLowerCase() === cleanName.toLowerCase())) {
      socket.emit('errorMessage', 'Dieser Nickname ist in diesem Raum bereits vergeben.');
      return;
    }
    const color = COLORS[room.players.length % COLORS.length];
    room.players.push({ id: socket.id, nickname: cleanName, color, score: 0 });
    playerRoom.set(socket.id, code);
    socket.join(code);
    socket.emit('joinedRoom', { roomCode: code, playerId: socket.id });
    emitRoomState(room);
  });

  socket.on('leaveRoom', () => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;
    socket.leave(room.code);
    playerRoom.delete(socket.id);
    removePlayer(room, socket.id);
    socket.emit('leftRoom');
  });

  socket.on('startGame', () => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit('errorMessage', 'Nur der Host kann das Spiel starten.');
      return;
    }
    if (room.players.length < MIN_PLAYERS) {
      socket.emit('errorMessage', `Mindestens ${MIN_PLAYERS} Spieler benötigt.`);
      return;
    }
    startMatch(room);
  });

  socket.on('drawPoint', ({ x, y, isNewStroke }) => {
    const room = findRoomBySocketId(socket.id);
    if (!room || room.phase !== 'drawing' || room.activePlayerId !== socket.id) return;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || nx < 0 || ny < 0 || nx > 1 || ny > 1) return;
    if (!room.turnStartedAt) {
      room.turnStartedAt = Date.now();
      room.turnEndsAt = room.turnStartedAt + DRAW_TURN_MS;
      room.drawTimer = setTimeout(() => {
        advanceToNextTurn(room, 'timer_expired');
      }, DRAW_TURN_MS);
      emitRoomState(room);
    }
    const payload = {
      playerId: socket.id,
      color: room.players.find((p) => p.id === socket.id)?.color || '#ffffff',
      x: nx,
      y: ny,
      isNewStroke: Boolean(isNewStroke)
    };
    room.strokes.push(payload);
    io.to(room.code).emit('drawPoint', payload);
  });

  socket.on('strokeEnd', () => {
    const room = findRoomBySocketId(socket.id);
    if (!room || room.phase !== 'drawing' || room.activePlayerId !== socket.id) return;
    if (!room.turnStartedAt) return;
    advanceToNextTurn(room, 'stroke_end');
  });

  socket.on('castVote', ({ targetId }) => {
    const room = findRoomBySocketId(socket.id);
    if (!room || room.phase !== 'voting') return;
    if (!room.players.some((p) => p.id === targetId)) return;
    room.votes[socket.id] = targetId;
    recalcVoteCounts(room);
    emitRoomState(room);
    if (Object.keys(room.votes).length >= room.players.length) {
      concludeVoting(room);
    }
  });

  socket.on('submitImposterGuess', ({ guess }) => {
    const room = findRoomBySocketId(socket.id);
    if (!room || room.phase !== 'showdown' || socket.id !== room.imposterId) return;
    const submitted = normalizeGuess(guess);
    const solution = normalizeGuess(room.word);
    if (submitted && submitted === solution) {
      finishGame(room, 'heist_win');
      return;
    }
    finishGame(room, 'artists_win');
  });

  socket.on('playAgain', () => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit('errorMessage', 'Nur der Host kann eine neue Runde starten.');
      return;
    }
    if (room.phase !== 'ended' && room.phase !== 'lobby') return;
    if (room.players.length < MIN_PLAYERS) {
      socket.emit('errorMessage', `Mindestens ${MIN_PLAYERS} Spieler benötigt.`);
      return;
    }
    startMatch(room);
  });

  socket.on('requestCanvasSync', () => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;
    socket.emit('canvasSnapshot', room.strokes);
  });

  socket.on('disconnect', () => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;
    playerRoom.delete(socket.id);
    removePlayer(room, socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`SABOTAGE CANVAS server running on port ${PORT}`);
});
