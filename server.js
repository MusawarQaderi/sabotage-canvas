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
const COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#fb7185', '#34d399'];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const playerRoom = new Map();

function sanitizeNickname(input) {
  const value = String(input || '').trim().replace(/\s+/g, ' ');
  return value ? value.slice(0, 20) : null;
}

function randomInt(max) { return Math.floor(Math.random() * max); }

function createRoomCode() {
  let code;
  do { code = String(randomInt(10000)).padStart(4, '0'); } while (rooms.has(code));
  return code;
}

function clearTimers(room) {
  if (room.drawTimer) clearTimeout(room.drawTimer);
  if (room.voteTimer) clearTimeout(room.voteTimer);
  if (room.showdownTimer) clearTimeout(room.showdownTimer);
  room.drawTimer = room.voteTimer = room.showdownTimer = null;
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
  // Mische die Optionen, damit das richtige Wort nicht immer an derselben Stelle steht
  room.options = [...chosen.options].sort(() => Math.random() - 0.5);
  room.usedWords.add(chosen.word);
  room.sabotageUsed = false;
  
  const imposter = room.players[randomInt(room.players.length)];
  room.imposterId = imposter.id;
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
    players: room.players.map((p) => ({ ...p, isHost: p.id === room.hostId })),
    drawingLegend: room.players.map((p) => ({ id: p.id, nickname: p.nickname, color: p.color })),
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
    socket.emit('roleInfo', {
      phase: room.phase,
      category: room.category || null,
      isImposter,
      word: isImposter ? null : room.word || null,
      options: room.phase === 'lobby' ? [] : room.options, // Optionen für ALLE sichtbar
      sabotageUsed: room.sabotageUsed
    });
  }
}

function emitRoomState(room) {
  io.to(room.code).emit('roomState', baseRoomState(room));
  emitRoleInfo(room);
}

function findRoomBySocketId(socketId) {
  const roomCode = playerRoom.get(socketId);
  return roomCode ? rooms.get(roomCode) || null : null;
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
  room.votes = {};
  room.voteCounts = {};
  room.voteEndsAt = Date.now() + VOTING_MS;
  room.voteTimer = setTimeout(() => concludeVoting(room), VOTING_MS);
  io.to(room.code).emit('phaseChanged', { phase: 'voting' });
  emitRoomState(room);
}

function advanceToNextTurn(room, reason) {
  if (room.phase !== 'drawing') return;
  clearTimeout(room.drawTimer);
  room.drawTimer = room.turnEndsAt = room.turnStartedAt = null;
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
  if (!room.turnOrder.length) return beginVoting(room);
  
  const activeId = room.turnOrder[room.currentTurnIndex];
  room.activePlayerId = activeId;
  room.turnStartedAt = room.turnEndsAt = null;
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
  room.result = { outcome, imposterId: room.imposterId, word: room.word, category: room.category };
  io.to(room.code).emit('phaseChanged', { phase: 'ended', outcome });
  emitRoomState(room);
}

function beginShowdown(room) {
  clearTimers(room);
  room.phase = 'showdown';
  room.showdownEndsAt = Date.now() + SHOWDOWN_MS;
  room.showdownTimer = setTimeout(() => finishGame(room, 'artists_win'), SHOWDOWN_MS);
  io.to(room.code).emit('phaseChanged', { phase: 'showdown' });
  emitRoomState(room);
}

function concludeVoting(room) {
  if (room.phase !== 'voting') return;
  clearTimeout(room.voteTimer);
  room.voteTimer = null;
  recalcVoteCounts(room);
  
  const entries = Object.entries(room.voteCounts).sort((a, b) => b[1] - a[1]);
  let votedOutId = null;
  if (entries.length) {
    const highest = entries[0][1];
    const tied = entries.filter((entry) => entry[1] === highest).length > 1;
    if (!tied) votedOutId = entries[0][0];
  }
  room.votedOutId = votedOutId;
  if (!votedOutId || votedOutId !== room.imposterId) return finishGame(room, 'imposter_victory');
  beginShowdown(room);
}

function resetForLobby(room, reason) {
  clearTimers(room);
  room.phase = 'lobby';
  room.roundNumber = Math.max(room.roundNumber, 1);
  room.turnOrder = [];
  room.currentTurnIndex = room.turnNumber = room.totalTurns = 0;
  room.activePlayerId = room.category = room.word = room.imposterId = null;
  room.options = [];
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
  room.strokes = [];
  room.votes = {};
  assignRoundSecrets(room);
  room.turnOrder = room.players.map((p) => p.id);
  room.currentTurnIndex = room.turnNumber = 0;
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
  const wasActive = room.activePlayerId === socketId;
  
  room.turnOrder = room.turnOrder.filter(id => id !== socketId);
  if (!room.players.length) return rooms.delete(room.code);
  if (room.hostId === socketId) room.hostId = room.players[0].id;
  
  if (room.players.length < MIN_PLAYERS && room.phase !== 'lobby') {
    return resetForLobby(room, 'Zu wenige Spieler. Zurück in die Lobby.');
  }
  
  if (room.phase === 'drawing' && wasActive) {
    advanceToNextTurn(room, 'player_left');
  } else if (room.phase === 'voting' && Object.keys(room.votes).length >= room.players.length) {
    concludeVoting(room);
  } else if (room.phase === 'showdown' && removed.id === room.imposterId) {
    finishGame(room, 'artists_win');
  } else {
    emitRoomState(room);
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ nickname }) => {
    const cleanName = sanitizeNickname(nickname);
    if (!cleanName) return socket.emit('errorMessage', 'Ungültiger Nickname.');
    const code = createRoomCode();
    const room = {
      code, hostId: socket.id, phase: 'lobby', roundNumber: 0,
      players: [{ id: socket.id, nickname: cleanName, color: COLORS[0], score: 0 }],
      strokes: [], usedWords: new Set(), options: [], sabotageUsed: false
    };
    rooms.set(code, room);
    playerRoom.set(socket.id, code);
    socket.join(code);
    socket.emit('joinedRoom', { roomCode: code, playerId: socket.id });
    emitRoomState(room);
  });

  socket.on('joinRoom', ({ nickname, roomCode }) => {
    const cleanName = sanitizeNickname(nickname);
    const room = rooms.get(String(roomCode || '').trim());
    if (!cleanName || !room) return socket.emit('errorMessage', 'Fehlerhafter Code oder Name.');
    if (room.phase !== 'lobby') return socket.emit('errorMessage', 'Spiel läuft bereits.');
    if (room.players.length >= MAX_PLAYERS) return socket.emit('errorMessage', 'Raum ist voll.');
    
    room.players.push({ id: socket.id, nickname: cleanName, color: COLORS[room.players.length % COLORS.length], score: 0 });
    playerRoom.set(socket.id, room.code);
    socket.join(room.code);
    socket.emit('joinedRoom', { roomCode: room.code, playerId: socket.id });
    emitRoomState(room);
  });

  socket.on('leaveRoom', () => {
    const room = findRoomBySocketId(socket.id);
    if (room) { socket.leave(room.code); playerRoom.delete(socket.id); removePlayer(room, socket.id); }
    socket.emit('leftRoom');
  });

  socket.on('startGame', () => {
    const room = findRoomBySocketId(socket.id);
    if (room && room.hostId === socket.id) startMatch(room);
  });

  socket.on('triggerSabotage', () => {
    const room = findRoomBySocketId(socket.id);
    if (!room || room.phase !== 'drawing' || room.imposterId !== socket.id || room.sabotageUsed) return;
    room.sabotageUsed = true;
    io.to(room.code).emit('sabotageTriggered');
    emitRoleInfo(room); // Update UI for Imposter button
  });

  socket.on('drawPoint', ({ x, y, isNewStroke }) => {
    const room = findRoomBySocketId(socket.id);
    if (!room || room.phase !== 'drawing' || room.activePlayerId !== socket.id) return;
    if (!room.turnStartedAt) {
      room.turnStartedAt = Date.now();
      room.turnEndsAt = room.turnStartedAt + DRAW_TURN_MS;
      room.drawTimer = setTimeout(() => advanceToNextTurn(room, 'timer_expired'), DRAW_TURN_MS);
      emitRoomState(room);
    }
    const payload = { playerId: socket.id, color: room.players.find(p => p.id === socket.id)?.color, x, y, isNewStroke };
    room.strokes.push(payload);
    io.to(room.code).emit('drawPoint', payload);
  });

  socket.on('strokeEnd', () => {
    const room = findRoomBySocketId(socket.id);
    if (room && room.phase === 'drawing' && room.activePlayerId === socket.id && room.turnStartedAt) advanceToNextTurn(room, 'stroke_end');
  });

  socket.on('castVote', ({ targetId }) => {
    const room = findRoomBySocketId(socket.id);
    if (!room || room.phase !== 'voting') return;
    room.votes[socket.id] = targetId;
    recalcVoteCounts(room);
    emitRoomState(room);
    if (Object.keys(room.votes).length >= room.players.length) concludeVoting(room);
  });

  socket.on('submitImposterGuess', ({ guess }) => {
    const room = findRoomBySocketId(socket.id);
    if (!room || room.phase !== 'showdown' || socket.id !== room.imposterId) return;
    finishGame(room, guess === room.word ? 'heist_win' : 'artists_win');
  });

  socket.on('playAgain', () => {
    const room = findRoomBySocketId(socket.id);
    if (room && room.hostId === socket.id && (room.phase === 'ended' || room.phase === 'lobby')) startMatch(room);
  });

  socket.on('requestCanvasSync', () => {
    const room = findRoomBySocketId(socket.id);
    if (room) socket.emit('canvasSnapshot', room.strokes);
  });

  socket.on('disconnect', () => {
    const room = findRoomBySocketId(socket.id);
    if (room) { playerRoom.delete(socket.id); removePlayer(room, socket.id); }
  });
});

server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
