const { WebSocketServer } = require('ws');
const { matchesWsPath } = require('./wsPathMatch');
const {
  READ_ROUND_MS,
  buildChallenge,
  serializeChallenge,
  randomBotName,
  parseSubmit,
  calcRoundPoints,
  calcStoryRushExp,
} = require('./storyRushPuzzles');
const {
  parseJoinLearningLanguage,
  resolveRoomLearningLanguage,
} = require('./gameRealtimeHelpers');

const WS_PATH = '/ws/story-rush';
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

const registerStoryRushSocket = server => {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (!matchesWsPath(request.url, WS_PATH)) {
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
      finished: player.finished,
    }));

  const serializeLobbyPlayers = (room, viewerId) =>
    room.players.map(player => ({
      id: player.id,
      name: player.name,
      isYou: player.id === viewerId,
    }));

  const pushLeaderboard = room => {
    const leaderboard = [...room.players]
      .sort((a, b) => {
        if (a.finished !== b.finished) {
          return a.finished ? -1 : 1;
        }
        return b.score - a.score;
      })
      .map((player, index) => ({
        rank: index + 1,
        id: player.id,
        name: player.name,
        score: player.score,
        finished: player.finished,
      }));
    broadcastRoom(room, { type: 'leaderboard', leaderboard });
    return leaderboard;
  };

  const allPlayersFinished = room => room.players.every(p => p.finished);

  const maybeEndMatch = room => {
    if (room.ended) {
      return;
    }
    if (allPlayersFinished(room)) {
      endMatch(room);
    }
  };

  const endMatch = room => {
    if (room.ended) {
      return;
    }
    room.ended = true;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
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
      const yourExp = player.isBot ? 0 : calcStoryRushExp(player.score, rank || 5);
      sendJson(player.socket, {
        type: 'match_ended',
        leaderboard,
        winnerId: winner?.id || null,
        winnerName: winner?.name || null,
        yourScore: player.score,
        yourRank: rank || leaderboard.length,
        yourExp,
        accuracyPoints: player.accuracyPoints,
        speedPoints: player.speedPoints,
        rankBonus: player.rankBonus,
        correctWords: player.correctWords,
        wrongWords: player.wrongWords,
        finishMs: player.finishMs,
        finishedInTime: player.finishedInTime,
      });
    });
    room.players.forEach(player => {
      if (player.socket) {
        socketMeta.set(player.socket, { ...socketMeta.get(player.socket), roomId: null });
      }
    });
    rooms.delete(room.id);
  };

  const applyFinish = (room, player, submit) => {
    if (player.finished) {
      return null;
    }
    const now = Date.now();
    const finishedInTime = now <= room.roundEndsAt;
    const finishMs = Math.min(READ_ROUND_MS, Math.max(0, submit.finishMs || now - room.roundStartedAt));
    if (!finishedInTime && submit.correctWords < submit.totalWords * 0.5) {
      player.finished = true;
      player.finishedInTime = false;
      player.score = 0;
      player.accuracyPoints = 0;
      player.speedPoints = 0;
      player.rankBonus = 0;
      player.correctWords = submit.correctWords;
      player.wrongWords = submit.wrongWords;
      player.finishMs = finishMs;
      return { finishedInTime: false, total: 0, accuracyPoints: 0, speedPoints: 0, rankBonus: 0 };
    }

    room.finishCount += 1;
    const finishRank = room.finishCount - 1;
    const points = calcRoundPoints(submit, finishRank, finishedInTime);
    player.finished = true;
    player.finishedInTime = finishedInTime;
    player.correctWords = submit.correctWords;
    player.wrongWords = submit.wrongWords;
    player.finishMs = finishMs;
    player.accuracyPoints = points.accuracyPoints;
    player.speedPoints = points.speedPoints;
    player.rankBonus = points.rankBonus;
    player.score = points.total;
    return { ...points, finishRank, finishedInTime };
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
    sendJson(targetSocket, {
      type: 'match_start',
      roomId: room.id,
      roundEndsAt: room.roundEndsAt,
      durationMs: READ_ROUND_MS,
      players: serializePlayers(room).map(p => ({
        ...p,
        isYou: p.id === playerId,
      })),
      story: serializeChallenge(room.story),
    });
  };

  const startMatch = room => {
    if (room.started || room.ended) {
      return;
    }
    room.started = true;
    room.story = buildChallenge(room.learningLanguage);
    room.roundStartedAt = Date.now();
    room.roundEndsAt = room.story.roundEndsAt;
    room.finishCount = 0;
    room.roundTimer = setTimeout(() => endMatch(room), READ_ROUND_MS);
    startBotLoop(room);
    room.players.forEach(player => {
      if (player.socket) {
        sendMatchStart(room, player.socket, player.id);
      }
    });
    pushLeaderboard(room);
  };

  const simulateBotFinish = (room, bot) => {
    if (bot.finished || room.ended) {
      return;
    }
    const totalWords = room.story?.wordCount || 80;
    const accuracy = 0.55 + Math.random() * 0.35;
    const correctWords = Math.floor(totalWords * accuracy);
    const wrongWords = Math.max(0, totalWords - correctWords - Math.floor(Math.random() * 5));
    const finishMs = Math.floor(READ_ROUND_MS * (0.35 + Math.random() * 0.55));
    const submit = parseSubmit({
      correctWords,
      wrongWords,
      totalWords,
      finishMs,
    });
    const result = applyFinish(room, bot, submit);
    if (!result) {
      return;
    }
    broadcastRoom(room, {
      type: 'opponent_finished',
      playerId: bot.id,
      playerName: bot.name,
      score: bot.score,
      finished: true,
    });
    pushLeaderboard(room);
    maybeEndMatch(room);
  };

  const startBotLoop = room => {
    room.botTimer = setInterval(() => {
      room.players
        .filter(p => p.isBot && !p.finished)
        .forEach(bot => {
          if (Math.random() < 0.35) {
            simulateBotFinish(room, bot);
          }
        });
    }, 3500 + Math.floor(Math.random() * 2500));
  };

  const createRoom = humanEntries => {
    const roomId = `sr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const usedNames = new Set();
    const players = [];

    humanEntries.forEach(entry => {
      usedNames.add(entry.displayName);
      players.push({
        id: entry.playerId,
        name: entry.displayName,
        isBot: false,
        socket: entry.socket,
        score: 0,
        finished: false,
        finishedInTime: false,
        correctWords: 0,
        wrongWords: 0,
        finishMs: 0,
        accuracyPoints: 0,
        speedPoints: 0,
        rankBonus: 0,
      });
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
        finished: false,
        finishedInTime: false,
        correctWords: 0,
        wrongWords: 0,
        finishMs: 0,
        accuracyPoints: 0,
        speedPoints: 0,
        rankBonus: 0,
      });
    }

    const room = {
      id: roomId,
      players,
      learningLanguage: resolveRoomLearningLanguage(humanEntries),
      story: null,
      roundStartedAt: null,
      roundEndsAt: null,
      finishCount: 0,
      started: false,
      ended: false,
      roundTimer: null,
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

  const handleSubmitFinish = (socket, payload) => {
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
    const storyId = String(payload.storyId || '');
    if (!room.story || room.story.id !== storyId) {
      sendJson(socket, { type: 'error', message: 'Story expired.' });
      return;
    }
    const submit = parseSubmit({
      correctWords: payload.correctWords,
      wrongWords: payload.wrongWords,
      totalWords: payload.totalWords,
      finishMs: payload.finishMs,
    });
    const result = applyFinish(room, player, submit);
    if (!result) {
      sendJson(socket, { type: 'error', message: 'Already submitted.' });
      return;
    }
    sendJson(socket, {
      type: 'finish_result',
      storyId: room.story.id,
      score: player.score,
      accuracyPoints: result.accuracyPoints,
      speedPoints: result.speedPoints,
      rankBonus: result.rankBonus,
      finishRank: result.finishRank,
      finishedInTime: result.finishedInTime,
    });
    broadcastRoom(room, {
      type: 'opponent_finished',
      playerId: player.id,
      playerName: player.name,
      score: player.score,
      finished: true,
    }, socket);
    pushLeaderboard(room);
    maybeEndMatch(room);
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
        queue.push({ socket, playerId, displayName, learningLanguage });
        socketMeta.set(socket, { playerId, roomId: null });
        sendJson(socket, {
          type: 'queue_joined',
          position: queue.length,
          maxSearchMs: MAX_SEARCH_MS,
          searchEndsAt: Date.now() + MAX_SEARCH_MS,
        });
        scheduleQueueMatch();
        return;
      }

      if (type === 'leave_queue') {
        removeFromQueue(socket);
        sendJson(socket, { type: 'queue_left' });
        return;
      }

      if (type === 'submit_finish') {
        handleSubmitFinish(socket, payload);
        return;
      }

      if (type === 'forfeit') {
        const meta = socketMeta.get(socket);
        if (meta?.roomId) {
          const room = rooms.get(meta.roomId);
          if (room && !room.ended) {
            const player = room.players.find(p => p.id === meta.playerId);
            if (player && !player.finished) {
              player.finished = true;
              player.score = 0;
              pushLeaderboard(room);
              maybeEndMatch(room);
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

  console.log(`StoryRush socket ready at ${WS_PATH}`);
};

module.exports = { registerStoryRushSocket, WS_PATH };
