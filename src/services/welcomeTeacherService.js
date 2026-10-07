const { User } = require('../models/User');
const { COMPANION_SEED_ENTRIES } = require('../data/companionSeedData');

const WELCOME_TEACHER_ID = 'nami';

/**
 * Every account starts with a chat from Nami so the Chat tab never opens empty.
 * Runs once per user (new and existing): the flag stops her from coming back
 * after the user deletes that chat.
 * Returns the seeded session, or null when nothing was added.
 */
const ensureWelcomeTeacherChat = async userId => {
  const seed = COMPANION_SEED_ENTRIES.find(entry => entry.slug === WELCOME_TEACHER_ID);
  if (!seed) {
    return null;
  }
  const greeting = String(seed.introMessage || '').trim() || `Hi! I'm ${seed.name}.`;
  const session = {
    id: `chat-welcome-${WELCOME_TEACHER_ID}`,
    title: seed.name,
    preview: greeting,
    time: '',
    companion: {
      id: WELCOME_TEACHER_ID,
      name: seed.name,
      type: 'teacher',
      image: seed.image || '',
      description: seed.description || '',
    },
    unread: true,
    archived: false,
    messages: [{ id: `welcome-${WELCOME_TEACHER_ID}-1`, role: 'ai', text: greeting }],
  };

  // Atomic: only when not seeded before and the user has no Nami chat yet.
  const added = await User.updateOne(
    {
      _id: userId,
      'dashboard.welcomeTeacherSeeded': { $ne: true },
      'dashboard.chats.companion.id': { $ne: WELCOME_TEACHER_ID },
    },
    {
      $push: { 'dashboard.chats': { $each: [session], $position: 0 } },
      $set: { 'dashboard.welcomeTeacherSeeded': true },
    },
  );
  if (added.modifiedCount) {
    return session;
  }
  // Already chatting with Nami: just remember we're done.
  await User.updateOne(
    { _id: userId, 'dashboard.welcomeTeacherSeeded': { $ne: true } },
    { $set: { 'dashboard.welcomeTeacherSeeded': true } },
  );
  return null;
};

module.exports = { ensureWelcomeTeacherChat, WELCOME_TEACHER_ID };
