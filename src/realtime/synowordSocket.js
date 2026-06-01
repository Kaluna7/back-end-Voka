const { WebSocketServer } = require('ws');
const {
  MATCH_DURATION_MS,
  POINTS_CORRECT,
  POINTS_WRONG,
  buildChallenge,
  serializeChallenge,
  randomBotName,
  calcSynowordExp,
  isCorrectAnswer,
  pickBotAnswer,
  normalizeAnswer,
} = require('./synowordPuzzles');
const {
  parseJoinLearningLanguage,
  resolveRoomLearningLanguage,
} = require('./gameRealtimeHelpers');

const WS_PATH = '/ws/synoword';
const MAX_SEARCH_MS = 22 * 1000;
const QUICK_MATCH_MIN_HUMANS = 2;
const QUICK_MATCH_WAIT_MS = 8000;
const LOBBY_DURATION_MS = 3200;
const TARGET_PLAYERS = 5;
const FILL_STAGES = [
  { atMs: 10 * 1000, target: 2 },
  { atMs: 15 * 1000, target: 3 },
  { atMs: 20 * 1000, target: 5 },
];

const sendJson = (socket, payload) => {
  if (socket.readyState !== socket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
};

const registerSynowordSocket = server => {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = String(request.url || '');
    if (!url.startsWith(WS_PATH)) {
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws, request);
    });
  });
  const queue = [];
  let queueTickInterval = null;
  let queueQuickTimer = null;
  let queueStartedAt = null;
  let lastRosterTarget = 0;
  let queueFlushing = false;
  const rooms = new Map();
  const socketMeta = new Map();

  const stopQueueTicker = () => {
    if (queueTickInterval) {
      clearInterval(queueTickInterval);
      queueTickInterval = null;
    }
    lastRosterTarget = 0;
    if (queueQuickTimer) {
      clearTimeout(queueQuickTimer);
      queueQuickTimer = null;
    }
  };

  const clearQueueTimers = () => {
    stopQueueTicker();
  };

  const buildRoster = (targetCount, viewerId) => {
    const usedNames = new Set();
    const humans = queue.slice(0, TARGET_PLAYERS);
    const roster = humans.map(entry => {
      usedNames.add(entry.displayName);
      return {
        id: entry.playerId,
        name: entry.displayName,
        isYou: entry.playerId === viewerId,
      };
    });
    while (roster.length < targetCount && roster.length < TARGET_PLAYERS) {
      roster.push({
        id: `fill_${Date.now()}_${roster.length}`,
        name: randomBotName(usedNames),
        isYou: false,
      });
    }
    return roster.slice(0, TARGET_PLAYERS);
  };

  const sendSearchRoster = targetCount => {
    if (queue.length === 0) {
      return;
    }
    queue.forEach(entry => {
      sendJson(entry.socket, {
        type: 'search_roster',
        players: buildRoster(targetCount, entry.playerId),
        playerCount: Math.min(targetCount, TARGET_PLAYERS),
        maxPlayers: TARGET_PLAYERS,
      });
    });
  };

  const removeFromQueue = socket => {
    const index = queue.findIndex(entry => entry.socket === socket);
    if (index >= 0) {
      queue.splice(index, 1);
    }
    if (queue.length === 0) {
      clearQueueTimers();
      queueStartedAt = null;
      queueFlushing = false;
    }
  };

  const broadcastRoom = (room, payload, exceptSocket = null) => {
    room.players.forEach(player => {
      if (exceptSocket && player.socket === exceptSocket) {
        return;
      }
      if (player.socket) {
        sendJson(player.socket, payload);
      }
    });
  };

  const serializePlayers = room =>
    room.players.map(player => ({
      id: player.id,
      name: player.name,
      score: player.score,
      isYou: false,
      solvedCount: player.solvedCount,
    }));

  const serializeLobbyPlayers = (room, viewerId) =>
    room.players.map(player => ({
      id: player.id,
      name: player.name,
      isYou: player.id === viewerId,
    }));

  const pushLeaderboard = room => {
    const leaderboard = [...room.players]
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({
        rank: index + 1,
        id: player.id,
        name: player.name,
        score: player.score,
      }));
    broadcastRoom(room, { type: 'leaderboard', leaderboard });
    return leaderboard;
  };

  const endMatch = room => {
    if (room.ended) {
      return;
    }
    room.ended = true;
    if (room.matchTimer) {
      clearTimeout(room.matchTimer);
      room.matchTimer = null;
    }
    if (room.botTimer) {
      clearInterval(room.botTimer);
      room.botTimer = null;
    }
    if (room.lobbyTimer) {
      clearTimeout(room.lobbyTimer);
      room.lobbyTimer = null;
    }
    const leaderboard = pushLeaderboard(room);
    const winner = leaderboard[0] || null;
    room.players.forEach(player => {
      if (!player.socket) {
        return;
      }
      const rank = leaderboard.findIndex(row => row.id === player.id) + 1;
      const yourExp = player.isBot ? 0 : calcSynowordExp(player.score, rank || 5);
      sendJson(player.socket, {
        type: 'match_ended',
        leaderboard,
        winnerId: winner?.id || null,
        winnerName: winner?.name || null,
        yourScore: player.score,
        yourRank: rank || leaderboard.length,
        yourExp,
        solvedCount: player.solvedCount,
      });
    });
    room.players.forEach(player => {
      if (player.socket) {
        socketMeta.set(player.socket, { ...socketMeta.get(player.socket), roomId: null });
      }
    });
    rooms.delete(room.id);
  };

  const assignChallenge = (player, room) => {
    player.challenge = buildChallenge(room.learningLanguage);
    return player.challenge;
  };

  const resolveAnswer = (player, answer, room) => {
    const challenge = player.challenge;
    if (!challenge) {
      return null;
    }
    const normalized = normalizeAnswer(answer);
    if (!normalized || normalized.length < 2) {
      return null;
    }
    const correct = isCorrectAnswer(challenge, normalized);
    if (correct) {
      player.score += POINTS_CORRECT;
      player.solvedCount += 1;
    } else {
      player.score = Math.max(0, player.score - POINTS_WRONG);
    }
    const result = {
      challengeId: challenge.id,
      answer: normalized,
      correct,
      score: player.score,
      solvedCount: player.solvedCount,
    };
    assignChallenge(player, room);
    result.nextChallenge = serializeChallenge(player.challenge);
    return result;
  };

  const sendMatchLobby = (room, targetSocket, playerId) => {
    sendJson(targetSocket, {
      type: 'match_lobby',
      roomId: room.id,
      lobbyDurationMs: LOBBY_DURATION_MS,
      players: serializeLobbyPlayers(room, playerId),
    });
  };

  const sendMatchStart = (room, targetSocket, playerId) => {
    const self = room.players.find(p => p.id === playerId);
    if (self && !self.challenge) {
      assignChallenge(self, room);
    }
    sendJson(targetSocket, {
      type: 'match_start',
      roomId: room.id,
      endsAt: room.endsAt,
      durationMs: MATCH_DURATION_MS,
      players: serializePlayers(room).map(p => ({
        ...p,
        isYou: p.id === playerId,
      })),
      challenge: serializeChallenge(self.challenge),
    });
  };

  const startMatch = room => {
    if (room.started || room.ended) {
      return;
    }
    room.started = true;
    room.endsAt = Date.now() + MATCH_DURATION_MS;
    room.players.forEach(player => assignChallenge(player, room));
    room.matchTimer = setTimeout(() => endMatch(room), MATCH_DURATION_MS);
    startBotLoop(room);
    room.players.forEach(player => {
      if (player.socket) {
        sendMatchStart(room, player.socket, player.id);
      }
    });
    pushLeaderboard(room);
  };

  const runBotTurn = room => {
    if (room.ended) {
      return;
    }
    room.players
      .filter(player => player.isBot)
      .forEach(bot => {
        const shouldBeCorrect = Math.random() < 0.72;
        const answer = shouldBeCorrect
          ? pickBotAnswer(bot.challenge)
          : `WRONG${Math.floor(Math.random() * 90)}`;
        const result = resolveAnswer(bot, answer, room);
        if (!result) {
          return;
        }
        broadcastRoom(room, {
          type: 'opponent_answer',
          playerId: bot.id,
          playerName: bot.name,
          correct: result.correct,
          score: bot.score,
          solvedCount: bot.solvedCount,
        });
      });
    pushLeaderboard(room);
  };

  const startBotLoop = room => {
    room.botTimer = setInterval(() => runBotTurn(room), 4000 + Math.floor(Math.random() * 2000));
  };

  const createRoom = humanEntries => {
    const roomId = `syn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const usedNames = new Set();
    const players = [];

    humanEntries.forEach(entry => {
      usedNames.add(entry.displayName);
      const player = {
        id: entry.playerId,
        name: entry.displayName,
        isBot: false,
        socket: entry.socket,
        score: 0,
        solvedCount: 0,
        challenge: null,
      };
      players.push(player);
      socketMeta.set(entry.socket, { playerId: entry.playerId, roomId });
    });

    while (players.length < TARGET_PLAYERS) {
      const botId = `bot_${roomId}_${players.length}`;
      players.push({
        id: botId,
        name: randomBotName(usedNames),
        isBot: true,
        socket: null,
        score: 0,
        solvedCount: 0,
        challenge: null,
      });
    }

    const room = {
      id: roomId,
      players,
      learningLanguage: resolveRoomLearningLanguage(humanEntries),
      endsAt: null,
      started: false,
      ended: false,
      matchTimer: null,
      botTimer: null,
      lobbyTimer: null,
    };

    rooms.set(roomId, room);

    players.forEach(player => {
      if (player.socket) {
        sendMatchLobby(room, player.socket, player.id);
      }
    });

    room.lobbyTimer = setTimeout(() => startMatch(room), LOBBY_DURATION_MS);
    return room;
  };

  const flushQueue = () => {
    if (queueFlushing || queue.length === 0) {
      return;
    }
    queueFlushing = true;
    clearQueueTimers();
    queueStartedAt = null;

    const batch = queue.splice(0, Math.min(queue.length, TARGET_PLAYERS));
    batch.forEach(entry => {
      sendJson(entry.socket, {
        type: 'queue_matched',
        playerCount: batch.length,
        filledWithBots: batch.length < TARGET_PLAYERS,
      });
    });
    createRoom(batch);
    queueFlushing = false;
  };

  const processQueueTick = () => {
    if (queueFlushing || queue.length === 0) {
      if (queue.length === 0) {
        clearQueueTimers();
        queueStartedAt = null;
      }
      return;
    }

    if (queue.length >= TARGET_PLAYERS) {
      flushQueue();
      return;
    }

    if (!queueStartedAt) {
      queueStartedAt = Date.now();
    }

    const elapsed = Date.now() - queueStartedAt;

    if (queue.length >= QUICK_MATCH_MIN_HUMANS) {
      if (elapsed >= QUICK_MATCH_WAIT_MS) {
        flushQueue();
      }
      return;
    }

    if (elapsed >= MAX_SEARCH_MS) {
      flushQueue();
      return;
    }

    let target = 1;
    for (const stage of FILL_STAGES) {
      if (elapsed >= stage.atMs) {
        target = stage.target;
      }
    }

    if (target > lastRosterTarget) {
      lastRosterTarget = target;
      sendSearchRoster(target);
    }

    if (target >= TARGET_PLAYERS) {
      flushQueue();
    }
  };

  const startQueueTicker = () => {
    if (queueTickInterval) {
      return;
    }
    queueTickInterval = setInterval(processQueueTick, 400);
  };

  const scheduleQueueMatch = () => {
    if (queue.length === 0) {
      clearQueueTimers();
      queueStartedAt = null;
      return;
    }

    if (!queueStartedAt) {
      queueStartedAt = Date.now();
    }

    lastRosterTarget = 0;
    sendSearchRoster(1);
    lastRosterTarget = 1;
    startQueueTicker();
    processQueueTick();
  };

  const handleSubmitAnswer = (socket, payload) => {
    const meta = socketMeta.get(socket);
    if (!meta?.roomId) {
      sendJson(socket, { type: 'error', message: 'Not in a match.' });
      return;
    }
    const room = rooms.get(meta.roomId);
    if (!room || room.ended) {
      sendJson(socket, { type: 'error', message: 'Match has ended.' });
      return;
    }
    if (!room.started) {
      sendJson(socket, { type: 'error', message: 'Match has not started yet.' });
      return;
    }
    const player = room.players.find(p => p.id === meta.playerId);
    if (!player || player.isBot) {
      return;
    }

    const challengeId = String(payload.challengeId || '');
    if (!player.challenge || player.challenge.id !== challengeId) {
      sendJson(socket, { type: 'error', message: 'This question has expired.' });
      return;
    }

    const result = resolveAnswer(player, payload.answer, room);
    if (!result) {
      sendJson(socket, { type: 'error', message: 'Enter a synonym (at least 2 letters).' });
      return;
    }

    sendJson(socket, {
      type: 'answer_result',
      ...result,
    });

    broadcastRoom(room, {
      type: 'opponent_answer',
      playerId: player.id,
      playerName: player.name,
      correct: result.correct,
      score: player.score,
      solvedCount: player.solvedCount,
    });

    pushLeaderboard(room);
  };

  wss.on('connection', socket => {
    sendJson(socket, { type: 'connected', path: WS_PATH });

    socket.on('message', raw => {
      let payload;
      try {
        payload = JSON.parse(String(raw));
      } catch {
        sendJson(socket, { type: 'error', message: 'Invalid JSON.' });
        return;
      }

      const type = String(payload.type || '');

      if (type === 'join_queue') {
        removeFromQueue(socket);
        const playerId = String(payload.playerId || `guest_${Date.now()}`);
        const displayName = String(payload.displayName || 'Player').slice(0, 24);
        const learningLanguage = parseJoinLearningLanguage(payload);
        const entry = { socket, playerId, displayName, learningLanguage };
        queue.push(entry);
        socketMeta.set(socket, { playerId, roomId: null });
        const searchEndsAt = Date.now() + MAX_SEARCH_MS;
        sendJson(socket, {
          type: 'queue_joined',
          position: queue.length,
          maxSearchMs: MAX_SEARCH_MS,
          searchEndsAt,
        });
        scheduleQueueMatch();
        return;
      }

      if (type === 'leave_queue') {
        removeFromQueue(socket);
        sendJson(socket, { type: 'queue_left' });
        return;
      }

      if (type === 'submit_answer') {
        handleSubmitAnswer(socket, payload);
        return;
      }

      if (type === 'forfeit') {
        const meta = socketMeta.get(socket);
        if (meta?.roomId) {
          const room = rooms.get(meta.roomId);
          if (room && !room.ended) {
            const player = room.players.find(p => p.id === meta.playerId);
            if (player) {
              player.score = Math.max(0, player.score - 20);
              pushLeaderboard(room);
            }
          }
        }
        sendJson(socket, { type: 'forfeit_ack' });
        return;
      }

      sendJson(socket, { type: 'error', message: `Unknown type: ${type}` });
    });

    socket.on('close', () => {
      removeFromQueue(socket);
      const meta = socketMeta.get(socket);
      if (meta?.roomId) {
        const room = rooms.get(meta.roomId);
        if (room) {
          const player = room.players.find(p => p.id === meta.playerId);
          if (player) {
            player.socket = null;
          }
        }
      }
      socketMeta.delete(socket);
    });
  });

  console.log(`Synoword socket ready at ${WS_PATH}`);
};

module.exports = { registerSynowordSocket, WS_PATH };
