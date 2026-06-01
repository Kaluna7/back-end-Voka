const { WebSocketServer } = require('ws');
const { parseJoinLearningLanguage } = require('./gameRealtimeHelpers');

const WS_PATH = '/ws/game-lobby';
const VALID_GAME_KEYS = new Set([
  'sudoword',
  'synoword',
  'antoword',
  'wordsense',
  'word_detective',
  'context_master',
  'sentence_builder',
  'story_rush',
]);

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOM_MEMBERS = 5;

/** roomId -> { gameKey, hostPlayerId, members: Map<playerId, entry> } */
const rooms = new Map();
/** gameKey -> Map<playerId, entry> — players browsing this game's lobby */
const lobbies = new Map();
const socketMeta = new Map();
let inviteSeq = 0;

const sendJson = (socket, payload) => {
  if (socket.readyState !== socket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
};

const normalizeRoomId = raw =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

const generateUniqueRoomId = () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
  const fallback = `R${Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-5)}`;
  return rooms.has(fallback) ? `${fallback}${inviteSeq++}` : fallback;
};

const getLobby = gameKey => {
  if (!lobbies.has(gameKey)) {
    lobbies.set(gameKey, new Map());
  }
  return lobbies.get(gameKey);
};

const getRoomMemberPayload = room => {
  const members = [...room.members.values()].map(entry => ({
    id: entry.playerId,
    name: entry.displayName,
    isHost: entry.playerId === room.hostPlayerId,
  }));
  return members;
};

const broadcastRoom = roomId => {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  const members = getRoomMemberPayload(room);
  room.members.forEach(entry => {
    sendJson(entry.socket, {
      type: 'room_updated',
      roomId,
      gameKey: room.gameKey,
      isHost: entry.playerId === room.hostPlayerId,
      hostPlayerId: room.hostPlayerId,
      members,
    });
  });
};

const broadcastOnlineList = gameKey => {
  const lobby = getLobby(gameKey);
  const players = [...lobby.values()].map(entry => ({
    id: entry.playerId,
    name: entry.displayName,
    roomId: entry.roomId || null,
  }));

  lobby.forEach(entry => {
    sendJson(entry.socket, {
      type: 'lobby_online_list',
      gameKey,
      players: players.filter(row => row.id !== entry.playerId),
    });
  });
};

const leaveRoom = (socket, meta) => {
  if (!meta?.roomId) {
    return;
  }
  const room = rooms.get(meta.roomId);
  if (!room) {
    return;
  }
  room.members.delete(meta.playerId);
  if (room.members.size === 0) {
    rooms.delete(meta.roomId);
  } else {
    if (room.hostPlayerId === meta.playerId) {
      const nextHost = room.members.values().next().value;
      if (nextHost) {
        room.hostPlayerId = nextHost.playerId;
      }
    }
    broadcastRoom(meta.roomId);
  }
};

const removeFromLobby = socket => {
  const meta = socketMeta.get(socket);
  if (!meta) {
    return;
  }

  leaveRoom(socket, meta);

  const lobby = getLobby(meta.gameKey);
  lobby.delete(meta.playerId);
  if (lobby.size === 0) {
    lobbies.delete(meta.gameKey);
  }
  socketMeta.delete(socket);
  broadcastOnlineList(meta.gameKey);
};

const findEntryByPlayerId = (gameKey, playerId) => {
  const lobby = getLobby(gameKey);
  return lobby.get(playerId) || null;
};

const attachPlayerToRoom = (entry, roomId) => {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, message: 'Room not found. Check the Room ID.' };
  }
  if (room.gameKey !== entry.gameKey) {
    return { ok: false, message: 'This room is for a different game.' };
  }
  if (room.members.size >= MAX_ROOM_MEMBERS && !room.members.has(entry.playerId)) {
    return { ok: false, message: 'Room is full (max 5 players).' };
  }

  if (entry.roomId && entry.roomId !== roomId) {
    const prevMeta = { gameKey: entry.gameKey, playerId: entry.playerId, roomId: entry.roomId };
    leaveRoom(entry.socket, prevMeta);
  }

  entry.roomId = roomId;
  entry.partyId = roomId;
  room.members.set(entry.playerId, entry);
  broadcastRoom(roomId);
  return { ok: true, room, isHost: entry.playerId === room.hostPlayerId };
};

const createRoomForPlayer = entry => {
  const roomId = generateUniqueRoomId();
  const room = {
    gameKey: entry.gameKey,
    hostPlayerId: entry.playerId,
    members: new Map(),
  };
  rooms.set(roomId, room);
  entry.roomId = roomId;
  entry.partyId = roomId;
  room.members.set(entry.playerId, entry);
  return { roomId, room, isHost: true };
};

const registerPlayerInLobby = (socket, gameKey, playerId, displayName, learningLanguage) => {
  const lobby = getLobby(gameKey);
  const entry = {
    socket,
    playerId,
    displayName,
    learningLanguage,
    gameKey,
    roomId: null,
    partyId: null,
  };
  lobby.set(playerId, entry);
  socketMeta.set(socket, { gameKey, playerId });
  return entry;
};

const sendLobbyJoined = (socket, entry, room) => {
  const roomId = entry.roomId;
  const members = getRoomMemberPayload(room);
  sendJson(socket, {
    type: 'lobby_joined',
    gameKey: entry.gameKey,
    roomId,
    isHost: entry.playerId === room.hostPlayerId,
    hostPlayerId: room.hostPlayerId,
    members,
  });
};

const registerGameLobbySocket = server => {
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

      if (type === 'join_lobby') {
        removeFromLobby(socket);
        const gameKey = String(payload.gameKey || '');
        if (!VALID_GAME_KEYS.has(gameKey)) {
          sendJson(socket, { type: 'error', message: 'Unknown game.' });
          return;
        }
        const playerId = String(payload.playerId || `guest_${Date.now()}`);
        const displayName = String(payload.displayName || 'Player').slice(0, 24);
        const learningLanguage = parseJoinLearningLanguage(payload);
        const entry = registerPlayerInLobby(socket, gameKey, playerId, displayName, learningLanguage);

        const requestedRoomId = normalizeRoomId(payload.roomId);
        if (requestedRoomId) {
          const joined = attachPlayerToRoom(entry, requestedRoomId);
          if (!joined.ok) {
            removeFromLobby(socket);
            sendJson(socket, { type: 'join_room_failed', message: joined.message });
            return;
          }
          sendLobbyJoined(socket, entry, joined.room);
        } else {
          const created = createRoomForPlayer(entry);
          sendLobbyJoined(socket, entry, created.room);
          broadcastRoom(created.roomId);
        }

        broadcastOnlineList(gameKey);
        return;
      }

      if (type === 'join_room') {
        const meta = socketMeta.get(socket);
        if (!meta) {
          sendJson(socket, { type: 'error', message: 'Join a lobby first.' });
          return;
        }
        const entry = findEntryByPlayerId(meta.gameKey, meta.playerId);
        if (!entry) {
          sendJson(socket, { type: 'error', message: 'Player not in lobby.' });
          return;
        }
        const roomId = normalizeRoomId(payload.roomId);
        if (!roomId) {
          sendJson(socket, { type: 'join_room_failed', message: 'Enter a valid Room ID.' });
          return;
        }
        const joined = attachPlayerToRoom(entry, roomId);
        if (!joined.ok) {
          sendJson(socket, { type: 'join_room_failed', message: joined.message });
          return;
        }
        sendLobbyJoined(socket, entry, joined.room);
        broadcastOnlineList(meta.gameKey);
        return;
      }

      if (type === 'leave_lobby') {
        removeFromLobby(socket);
        sendJson(socket, { type: 'lobby_left' });
        return;
      }

      if (type === 'invite_friend') {
        const meta = socketMeta.get(socket);
        if (!meta) {
          sendJson(socket, { type: 'error', message: 'Join a lobby first.' });
          return;
        }
        const targetId = String(payload.targetPlayerId || '');
        const target = findEntryByPlayerId(meta.gameKey, targetId);
        const inviter = findEntryByPlayerId(meta.gameKey, meta.playerId);
        if (!target || target.socket === socket || !inviter) {
          sendJson(socket, {
            type: 'invite_failed',
            targetPlayerId: targetId,
            message: 'Player is not online in this lobby.',
          });
          return;
        }
        if (target.roomId && target.roomId !== inviter.roomId) {
          sendJson(socket, {
            type: 'invite_failed',
            targetPlayerId: targetId,
            message: 'That player is already in another room.',
          });
          return;
        }
        const inviteId = `inv_${Date.now()}_${inviteSeq++}`;
        sendJson(target.socket, {
          type: 'invite_received',
          inviteId,
          gameKey: meta.gameKey,
          roomId: inviter.roomId || null,
          from: {
            id: meta.playerId,
            name: inviter.displayName,
          },
        });
        sendJson(socket, {
          type: 'invite_sent',
          inviteId,
          targetPlayerId: targetId,
          targetName: target.displayName,
        });
        return;
      }

      if (type === 'respond_invite') {
        const meta = socketMeta.get(socket);
        if (!meta) {
          sendJson(socket, { type: 'error', message: 'Join a lobby first.' });
          return;
        }
        const inviteId = String(payload.inviteId || '');
        const accept = Boolean(payload.accept);
        const inviterId = String(payload.inviterId || '');
        const inviter = findEntryByPlayerId(meta.gameKey, inviterId);
        const responder = findEntryByPlayerId(meta.gameKey, meta.playerId);
        if (!inviter || !responder) {
          sendJson(socket, { type: 'invite_declined', inviteId });
          return;
        }
        if (!accept) {
          sendJson(inviter.socket, {
            type: 'invite_declined',
            inviteId,
            playerId: meta.playerId,
            playerName: responder.displayName,
          });
          sendJson(socket, { type: 'invite_declined_ack', inviteId });
          return;
        }

        const inviteRoomId = normalizeRoomId(payload.roomId) || inviter.roomId;
        if (inviteRoomId) {
          const joined = attachPlayerToRoom(responder, inviteRoomId);
          if (!joined.ok) {
            sendJson(socket, { type: 'join_room_failed', message: joined.message });
            return;
          }
          sendLobbyJoined(responder.socket, responder, joined.room);
        }

        sendJson(inviter.socket, {
          type: 'invite_accepted',
          inviteId,
          roomId: responder.roomId,
          playerId: meta.playerId,
          playerName: responder.displayName,
        });
        sendJson(socket, { type: 'invite_accepted_ack', inviteId, roomId: responder.roomId });
        broadcastOnlineList(meta.gameKey);
        return;
      }

      if (type === 'party_start') {
        const meta = socketMeta.get(socket);
        if (!meta) {
          sendJson(socket, { type: 'error', message: 'Join a lobby first.' });
          return;
        }
        const host = findEntryByPlayerId(meta.gameKey, meta.playerId);
        if (!host?.roomId) {
          sendJson(socket, { type: 'party_start_ack', solo: true });
          return;
        }
        const room = rooms.get(host.roomId);
        if (!room) {
          sendJson(socket, { type: 'party_start_ack', solo: true });
          return;
        }
        room.members.forEach(entry => {
          sendJson(entry.socket, {
            type: 'party_start',
            gameKey: meta.gameKey,
            roomId: host.roomId,
            startedBy: meta.playerId,
          });
        });
        return;
      }

      sendJson(socket, { type: 'error', message: `Unknown type: ${type}` });
    });

    socket.on('close', () => {
      removeFromLobby(socket);
    });
  });

  console.log(`Game lobby socket ready at ${WS_PATH}`);
};

module.exports = { registerGameLobbySocket, WS_PATH };
