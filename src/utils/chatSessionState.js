const MAX_CHATS = 100;
const MAX_MESSAGES_PER_CHAT = 300;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_PREVIEW_LENGTH = 280;
const MAX_TITLE_LENGTH = 120;

const clampText = (value, maxLength) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, maxLength);
};

const sanitizeChatMessage = (raw, index = 0) => {
  const role = raw?.role === 'user' ? 'user' : 'ai';
  // Opening stories run long (canon intros allow 8000); user turns are capped at 300 upstream.
  const text = clampText(raw?.text, MAX_MESSAGE_LENGTH);
  if (!text) {
    return null;
  }
  const id =
    typeof raw?.id === 'string' && raw.id.trim()
      ? raw.id.trim().slice(0, 80)
      : `chat-legacy-${index}-${role}`;
  return { id, role, text };
};

const sanitizeCompanion = raw => {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  const name = clampText(raw?.name, 80);
  if (!id || !name) {
    return null;
  }
  const type = raw?.type === 'teacher' ? 'teacher' : 'character';
  return {
    id,
    name,
    type,
    image: clampText(raw?.image, 240),
    description: clampText(raw?.description, 400),
  };
};

const sanitizeChatSession = raw => {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  const companion = sanitizeCompanion(raw?.companion);
  if (!id || !companion) {
    return null;
  }
  const messages = Array.isArray(raw?.messages)
    ? raw.messages
        .map((message, index) => sanitizeChatMessage(message, index))
        .filter(Boolean)
        .slice(-MAX_MESSAGES_PER_CHAT)
    : [];
  return {
    id,
    title: clampText(raw?.title, MAX_TITLE_LENGTH) || companion.name,
    preview: clampText(raw?.preview, MAX_PREVIEW_LENGTH) || messages[messages.length - 1]?.text || '',
    time: clampText(raw?.time, 40) || 'Now',
    companion,
    unread: Boolean(raw?.unread),
    archived: Boolean(raw?.archived ?? raw?.isArchived),
    messages,
  };
};

const teacherListIdForCompanion = companionId =>
  companionId ? `teacher-${String(companionId).trim()}` : '';

const resolveSessionArchived = (session, archivedSet) => {
  const teacherListId = teacherListIdForCompanion(session.companion?.id);
  if (
    archivedSet.has(session.id) ||
    (teacherListId ? archivedSet.has(teacherListId) : false)
  ) {
    return true;
  }
  return Boolean(session.archived);
};

const mergeChatArchiveState = (
  sessions,
  archivedChatListIds = [],
  previousSessions = [],
) => {
  const archivedSet = new Set(
    (Array.isArray(archivedChatListIds) ? archivedChatListIds : [])
      .map(id => String(id).trim())
      .filter(Boolean),
  );
  const previousById = new Map(
    (Array.isArray(previousSessions) ? previousSessions : [])
      .map(item => [item.id, item])
      .filter(([id]) => Boolean(id)),
  );
  const sanitized = sanitizeChatSessions(sessions);
  const mergedSessions = sanitized.map(session => {
    const previous = previousById.get(session.id);
    const previousMessages = Array.isArray(previous?.messages) ? previous.messages : [];
    const messages =
      session.messages.length >= previousMessages.length
        ? session.messages
        : previousMessages.length > 0
          ? previousMessages
          : session.messages;
    return {
      ...session,
      archived: resolveSessionArchived(session, archivedSet),
      messages,
    };
  });

  const nextArchivedIds = new Set(archivedSet);
  mergedSessions.forEach(session => {
    if (!session.archived) {
      return;
    }
    nextArchivedIds.add(session.id);
    if (session.companion?.type === 'teacher') {
      const teacherListId = teacherListIdForCompanion(session.companion.id);
      if (teacherListId) {
        nextArchivedIds.add(teacherListId);
      }
    }
  });

  return {
    chats: mergedSessions,
    archivedChatListIds: [...nextArchivedIds].slice(0, 200),
  };
};

const sanitizeChatSessions = (raw, fallback = []) => {
  const source = Array.isArray(raw) ? raw : fallback;
  const seen = new Set();
  const out = [];
  source.forEach(item => {
    const row = sanitizeChatSession(item);
    if (!row || seen.has(row.id)) {
      return;
    }
    seen.add(row.id);
    out.push(row);
  });
  return out.slice(0, MAX_CHATS);
};

const createMessageId = (role, index) => `chat-${Date.now()}-${index}-${role}`;

const upsertChatSessionMessages = (sessions, { companion, userText, aiText }) => {
  const safeCompanion = sanitizeCompanion(companion);
  if (!safeCompanion) {
    return sanitizeChatSessions(sessions);
  }
  const userMessage = sanitizeChatMessage(
    { id: createMessageId('user', 0), role: 'user', text: userText },
    0,
  );
  const aiMessage = sanitizeChatMessage(
    { id: createMessageId('ai', 1), role: 'ai', text: aiText },
    1,
  );
  if (!userMessage || !aiMessage) {
    return sanitizeChatSessions(sessions);
  }

  const list = sanitizeChatSessions(sessions);
  const existingIndex = list.findIndex(item => item.companion.id === safeCompanion.id);
  const nowLabel = 'Now';

  if (existingIndex === -1) {
    const nextSession = sanitizeChatSession({
      id: `chat-${Date.now()}`,
      title: safeCompanion.name,
      preview: userMessage.text,
      time: nowLabel,
      companion: safeCompanion,
      unread: false,
      archived: false,
      messages: [userMessage, aiMessage],
    });
    if (!nextSession) {
      return list;
    }
    return [nextSession, ...list].slice(0, MAX_CHATS);
  }

  const existing = list[existingIndex];
  const mergedMessages = [...existing.messages, userMessage, aiMessage].slice(-MAX_MESSAGES_PER_CHAT);
  const updated = {
    ...existing,
    companion: safeCompanion,
    preview: userMessage.text,
    time: nowLabel,
    unread: false,
    archived: Boolean(existing.archived),
    messages: mergedMessages,
  };
  const without = list.filter((_, index) => index !== existingIndex);
  return [updated, ...without];
};

/** Id prefix that marks an AI-generated opening story (survives message sanitizing). */
const OPENING_STORY_ID_PREFIX = 'opening-';

const isOpeningStoryMessage = message =>
  message?.role === 'ai' &&
  typeof message?.id === 'string' &&
  message.id.startsWith(OPENING_STORY_ID_PREFIX);

/**
 * Seed a character thread with its opening story as the only message.
 * Only touches threads the user has not spoken in yet; otherwise returns sessions unchanged.
 */
const upsertOpeningStoryMessage = (sessions, { companion, aiText, messageId }) => {
  const safeCompanion = sanitizeCompanion(companion);
  const aiMessage = sanitizeChatMessage({ id: messageId, role: 'ai', text: aiText }, 0);
  const list = sanitizeChatSessions(sessions);
  if (!safeCompanion || !aiMessage) {
    return list;
  }

  const existingIndex = list.findIndex(item => item.companion.id === safeCompanion.id);
  if (existingIndex === -1) {
    const nextSession = sanitizeChatSession({
      id: `chat-${Date.now()}`,
      title: safeCompanion.name,
      preview: aiMessage.text,
      time: 'Now',
      companion: safeCompanion,
      unread: false,
      archived: false,
      messages: [aiMessage],
    });
    return nextSession ? [nextSession, ...list].slice(0, MAX_CHATS) : list;
  }

  const existing = list[existingIndex];
  if (existing.messages.some(item => item.role === 'user')) {
    return list;
  }
  const updated = {
    ...existing,
    companion: safeCompanion,
    preview: aiMessage.text,
    time: 'Now',
    messages: [aiMessage],
  };
  const without = list.filter((_, index) => index !== existingIndex);
  return [updated, ...without];
};

const removeChatSessions = (sessions, sessionIds = []) => {
  const removeSet = new Set(
    (Array.isArray(sessionIds) ? sessionIds : [])
      .map(id => String(id).trim())
      .filter(Boolean),
  );
  if (!removeSet.size) {
    return sanitizeChatSessions(sessions);
  }
  return sanitizeChatSessions(sessions).filter(item => !removeSet.has(item.id));
};

module.exports = {
  MAX_CHATS,
  MAX_MESSAGES_PER_CHAT,
  sanitizeChatMessage,
  sanitizeChatSession,
  sanitizeChatSessions,
  mergeChatArchiveState,
  upsertChatSessionMessages,
  upsertOpeningStoryMessage,
  isOpeningStoryMessage,
  OPENING_STORY_ID_PREFIX,
  removeChatSessions,
};
