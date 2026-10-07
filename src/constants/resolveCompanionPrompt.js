const {
  getCompanionProfileSync,
  getCompanionPromptSync,
  isTeacherCompanionId,
} = require('../services/companionCatalogService');
const { getTeacherSystemPrompt } = require('./teacherPrompts');
const { learningLanguageDirective } = require('../utils/companionLocaleUtils');

const stripLearningLanguageLock = prompt =>
  String(prompt || '')
    .replace(/\n*CRITICAL — Learning language lock:[\s\S]*?(?=\n\n[A-Z]|\n*$)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Prompt tepercaya dari server (MongoDB cache).
 * Characters: English persona canon + fresh learning-language lock (active target language).
 */
const resolveCompanionPrompt = (companionId, clientPrompt, learningLanguage = 'English') => {
  if (isTeacherCompanionId(companionId)) {
    return (
      getCompanionPromptSync(companionId, learningLanguage) || getTeacherSystemPrompt(companionId)
    );
  }

  const trusted = getCompanionProfileSync(companionId, learningLanguage);
  if (trusted?.type === 'teacher') {
    return (
      getCompanionPromptSync(companionId, learningLanguage) || getTeacherSystemPrompt(companionId)
    );
  }

  const englishCanon = getCompanionPromptSync(companionId, 'English');
  const localized = getCompanionPromptSync(companionId, learningLanguage);
  const fromTrusted =
    typeof trusted?.prompt === 'string' && trusted.prompt.trim() ? trusted.prompt.trim() : '';
  const fromClient =
    typeof clientPrompt === 'string' && clientPrompt.trim() ? clientPrompt.trim() : '';

  const base = stripLearningLanguageLock(
    englishCanon || localized || fromTrusted || fromClient || '',
  );
  if (!base) {
    return '';
  }

  const lock = learningLanguageDirective(learningLanguage);
  return `${lock}\n\n${base}\n\n${lock}`;
};

module.exports = {
  resolveCompanionPrompt,
};
