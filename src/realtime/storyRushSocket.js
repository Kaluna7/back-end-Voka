const { WebSocketServer } = require('ws');
const {
  getGamePuzzlesWithin,
  prewarmGamePuzzles,
  usesAiPuzzles,
} = require('../services/aiGamePuzzleService');
const GAME_KEY = 'storyRush';
/** Longest a match waits for AI questions before falling back to the built-in ones. */
const PUZZLE_WAIT_MS = 25000;
const { matchesWsPath } = require('./wsPathMatch');
const {
  READ_ROUND_MS,
  buildChallenge,
  serializeChallenge,
  randomBotName,
  parseSubmit,
  hasReadEnough,
  calcRoundPoints,
  calcStoryRushExp,
} = require('./storyRushPuzzles');
const {
  parseJoinLearningLanguage,
  resolveRoomLearningLanguage,
} = require('./gameRealtimeHelpers');

const WS_PATH = '/ws/story-rush';
const MAX_SEARCH_MS = 18 * 1000;
const LOBBY_DURATION_MS = 2500;
const TARGET_PLAYERS = 5;
const ROSTER_SETTLE_MS = 1100;
const FILL_STAGES = [
  { atMs: 3 * 1000, target: 2 },
  { atMs: 6 * 1000, target: 3 },
  { atMs: 10 * 1000, target: 4 },
  { atMs: 14 * 1000, target: 5 },
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
  let pendingFlushTimer = null;
  let fillSlots = [];
  const rooms = new Map();
  const socketMeta = new Map();

  // Matchmaking lanes: players only meet others learning the same language.
  const laneOf = entry => entry?.learningLanguage || 'English';
  const sameLane = ref => (ref ? queue.filter(entry => laneOf(entry) === laneOf(ref)) : []);
  const headLaneSize = () => sameLane(queue[0]).length;

  const stopQueueTicker = () => {
    if (queueTickInterval) {
      clearInterval(queueTickInterval);
      queueTickInterval = null;
    }
    if (queueQuickTimer) {
      clearTimeout(queueQuickTimer);
      queueQuickTimer = null;
    }
  };

  const clearQueueTimers = () => {
    stopQueueTicker();
    if (pendingFlushTimer) {
      clearTimeout(pendingFlushTimer);
      pendingFlushTimer = null;
    }
  };

  const requestFlush = (delayMs = 0) => {
    if (queueFlushing || queue.length === 0 || pendingFlushTimer) {
      return;
    }
    if (delayMs <= 0) {
      flushQueue();
      return;
    }
    pendingFlushTimer = setTimeout(() => {
      pendingFlushTimer = null;
      flushQueue();
    }, delayMs);
  };

  const ensureFillSlots = needed => {
    const usedNames = new Set([
      ...queue.map(entry => entry.displayName),
      ...fillSlots.map(slot => slot.name),
    ]);
    while (fillSlots.length < needed) {
      const name = randomBotName(usedNames);
      usedNames.add(name);
      fillSlots.push({
        id: `fill_slot_${fillSlots.length}`,
        name,
      });
    }
  };

  const buildRoster = (targetCount, viewerId) => {
    const viewer = queue.find(entry => entry.playerId === viewerId);
    const humans = sameLane(viewer || queue[0]).slice(0, TARGET_PLAYERS);
    const roster = humans.map(entry => ({
      id: entry.playerId,
      name: entry.displayName,
      isYou: entry.playerId === viewerId,
    }));
    const fillNeeded = Math.max(0, Math.min(targetCount, TARGET_PLAYERS) - roster.length);
    ensureFillSlots(fillNeeded);
    for (let i = 0; i < fillNeeded; i += 1) {
      roster.push({
        id: fillSlots[i].id,
        name: fillSlots[i].name,
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
      lastRosterTarget = 0;
      fillSlots = [];
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
      // Points decide the order; finishing only breaks ties.
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (a.finished !== b.finished) {
          return a.finished ? -1 : 1;
        }
        return (a.finishMs || Infinity) - (b.finishMs || Infinity);
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

    // Only players who really read the story take a finishing place (1st, 2nd...).
    let finishRank = null;
    if (finishedInTime && hasReadEnough(submit)) {
      room.finishCount += 1;
      finishRank = room.finishCount - 1;
    }
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
    if (!room.puzzlesSettled) {
      if (!room.waitingForPuzzles) {
        room.waitingForPuzzles = true;
        room.players.forEach(player => {
          if (player.socket) {
            sendJson(player.socket, { type: 'questions_loading', language: room.learningLanguage });
          }
        });
        room.puzzlesReady.then(() => startMatch(room));
      }
      return;
    }
    room.started = true;
    room.story = buildChallenge(room.learningLanguage, room.aiItems);
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

  const createRoom = (humanEntries, botSlots = []) => {
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

    let botIndex = 0;
    while (players.length < TARGET_PLAYERS) {
      const slot = botSlots[botIndex];
      botIndex += 1;
      const botName = slot?.name || randomBotName(usedNames);
      usedNames.add(botName);
      players.push({
        id: slot?.id || `bot_${roomId}_${players.length}`,
        name: botName,
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
    room.aiItems = null;
    room.puzzlesSettled = !usesAiPuzzles(GAME_KEY, room.learningLanguage);
    room.puzzlesReady = room.puzzlesSettled
      ? Promise.resolve()
      : getGamePuzzlesWithin(GAME_KEY, room.learningLanguage, PUZZLE_WAIT_MS).then(items => {
          room.aiItems = items;
          room.puzzlesSettled = true;
        });
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
    lastRosterTarget = 0;
    const batch = sameLane(queue[0]).slice(0, TARGET_PLAYERS);
    batch.forEach(entry => queue.splice(queue.indexOf(entry), 1));
    const botsNeeded = Math.max(0, TARGET_PLAYERS - batch.length);
    ensureFillSlots(botsNeeded);
    const botSlots = fillSlots.slice(0, botsNeeded);
    fillSlots = [];

    batch.forEach(entry => {
      sendJson(entry.socket, {
        type: 'queue_matched',
        playerCount: batch.length,
        filledWithBots: batch.length < TARGET_PLAYERS,
      });
    });
    createRoom(batch, botSlots);
    queueFlushing = false;
    // Players in other language lanes keep searching, without restarting their wait.
    if (queue.length > 0) {
      queueStartedAt = Math.min(...queue.map(entry => entry.joinedAt || Date.now()));
      scheduleQueueMatch();
    }
  };

  const processQueueTick = () => {
    if (queueFlushing || queue.length === 0) {
      if (queue.length === 0) {
        clearQueueTimers();
        queueStartedAt = null;
      }
      return;
    }

    if (!queueStartedAt) {
      queueStartedAt = Date.now();
    }

    const elapsed = Date.now() - queueStartedAt;
    const laneSize = headLaneSize();
    let target = Math.max(1, Math.min(laneSize, TARGET_PLAYERS));

    if (laneSize >= TARGET_PLAYERS) {
      target = TARGET_PLAYERS;
    } else {
      for (const stage of FILL_STAGES) {
        if (elapsed >= stage.atMs) {
          target = Math.max(target, stage.target);
        }
      }
      if (elapsed >= MAX_SEARCH_MS) {
        target = TARGET_PLAYERS;
      }
    }

    target = Math.min(TARGET_PLAYERS, target);

    if (target > lastRosterTarget) {
      lastRosterTarget = target;
      sendSearchRoster(target);
    }

    if (lastRosterTarget >= TARGET_PLAYERS) {
      requestFlush(ROSTER_SETTLE_MS);
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
      lastRosterTarget = 0;
      return;
    }

    if (!queueStartedAt) {
      queueStartedAt = Date.now();
    }

    const nextTarget = Math.max(lastRosterTarget || 1, Math.min(headLaneSize(), TARGET_PLAYERS));
    if (nextTarget > lastRosterTarget) {
      lastRosterTarget = nextTarget;
      sendSearchRoster(nextTarget);
    } else if (lastRosterTarget < 1) {
      lastRosterTarget = 1;
      sendSearchRoster(1);
    } else {
      sendSearchRoster(lastRosterTarget);
    }
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
        queue.push({ socket, playerId, displayName, learningLanguage, joinedAt: Date.now() });
        prewarmGamePuzzles(GAME_KEY, learningLanguage);
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
