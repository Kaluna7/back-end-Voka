const { WebSocketServer } = require('ws');
const {
  getGamePuzzlesWithin,
  prewarmGamePuzzles,
  usesAiPuzzles,
} = require('../services/aiGamePuzzleService');
const GAME_KEY = 'sudoword';
/** Longest a match waits for AI questions before falling back to the built-in ones. */
const PUZZLE_WAIT_MS = 25000;
const {
  MATCH_DURATION_MS,
  POINTS_CORRECT,
  POINTS_WRONG,
  buildChallenge,
  serializeChallenge,
  randomBotName,
  calcSudowordExp,
} = require('./sudowordPuzzles');
const {
  parseJoinLearningLanguage,
  resolveRoomLearningLanguage,
} = require('./gameRealtimeHelpers');

const WS_PATH = '/ws/sudoword';
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

const registerSudowordSocket = server => {
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
      const yourExp = player.isBot ? 0 : calcSudowordExp(player.score, rank || 5);
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
    player.challenge = buildChallenge(room.learningLanguage, room.aiItems);
    return player.challenge;
  };

  const resolveAnswer = (player, letter, room) => {
    const challenge = player.challenge;
    if (!challenge) {
      return null;
    }
    const normalized = String(letter || '')
      .trim()
      .toUpperCase()
      .slice(0, 1);
    if (!normalized || !/^[A-Z]$/.test(normalized)) {
      return null;
    }
    const correct = normalized === challenge.answer;
    if (correct) {
      player.score += POINTS_CORRECT;
      player.solvedCount += 1;
    } else {
      player.score = Math.max(0, player.score - POINTS_WRONG);
    }
    const result = {
      challengeId: challenge.id,
      letter: normalized,
      correct,
      expected: challenge.answer,
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
        const letter = shouldBeCorrect
          ? bot.challenge.answer
          : String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const result = resolveAnswer(bot, letter, room);
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

  const createRoom = (humanEntries, botSlots = []) => {
    const roomId = `sw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

    // Only start after the search roster is full (5). Pause so UI can show all 5 first.
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

    // Keep progressing roster; never reset back to 1 when another player joins (avoids blink).
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

    const result = resolveAnswer(player, payload.letter, room);
    if (!result) {
      sendJson(socket, { type: 'error', message: 'Enter one letter A-Z.' });
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
        const entry = { socket, playerId, displayName, learningLanguage, joinedAt: Date.now() };
        prewarmGamePuzzles(GAME_KEY, learningLanguage);
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

  console.log(`Sudoword socket ready at ${WS_PATH}`);
};

module.exports = { registerSudowordSocket, WS_PATH };
