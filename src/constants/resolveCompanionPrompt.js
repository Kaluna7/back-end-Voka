const { getCompanionProfile } = require('./companions');
const { getTeacherSystemPrompt, isTeacherCompanionId } = require('./teacherPrompts');

/**
 * Prompt tepercaya dari server — guru tidak pernah memakai prompt client/karakter.
 */
const resolveCompanionPrompt = (companionId, clientPrompt) => {
  if (isTeacherCompanionId(companionId)) {
    return getTeacherSystemPrompt(companionId);
  }

  const trusted = getCompanionProfile(companionId);
  if (trusted?.type === 'teacher') {
    return getTeacherSystemPrompt(companionId);
  }

  if (typeof trusted?.prompt === 'string' && trusted.prompt.trim()) {
    return trusted.prompt.trim();
  }

  if (typeof clientPrompt === 'string' && clientPrompt.trim()) {
    return clientPrompt.trim();
  }

  return '';
};

module.exports = {
  resolveCompanionPrompt,
};
