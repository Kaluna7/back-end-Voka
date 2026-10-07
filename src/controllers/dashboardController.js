const { getEnv } = require('../config/env');
const { getListenLiveWsUrl } = require('../config/deepgramEndpoints');
const { User, sanitizeDashboard } = require('../models/User');
const { VOICE_PLANS, estimateVoiceTokensPerMinute } = require('../config/voicePlans');
const {
  syncVoiceBalance,
  activateVoicePlan,
  setSubscriptionCancelAtPeriodEnd,
} = require('../services/voiceTokenService');
const { resolveMemoryTier } = require('../config/memoryTiers');
const {
  verifyAndApplyPurchase,
  cancelUserGoogleSubscription,
  planToProduct,
  allowUnverifiedPurchases,
} = require('../services/googlePlayBillingService');
const { getVoiceBalance: getVoiceTokenBalanceData } = require('../services/voiceTokenService');
const { ensureWelcomeTeacherChat } = require('../services/welcomeTeacherService');
const {
  attachCompanionMemory,
  recordTurnForMemory,
  clearCompanionMemory,
} = require('../services/companionMemoryService');
const {
  CHAT_MAX_INPUT,
  DEEPSEEK_VOICE_HISTORY_LIMIT,
  DEEPSEEK_VOICE_MAX_TOKENS,
  DEEPSEEK_VOICE_TIMEOUT_MS,
  requestDeepseekReply,
  requestDeepseekReplyStreaming,
  evaluateBondSentimentWithAi,
} = require('../services/deepseekService');
const {
  transcribeAudioWithDeepgram,
  normalizeBase64Audio,
} = require('../services/deepgramService');
const { synthesizeSpeech } = require('../services/ttsService');
const {
  sanitizeTeacherCallPayload,
} = require('../utils/teacherCallAccess');
const { createDeepgramSttGrant } = require('../services/deepgramGrantService');
const {
  resolveLearningLanguage,
  resolveDeepgramSttLanguage,
  resolveTtsModelForUser,
  resolveVoiceVariantForCompanion,
  normalizeLearningLanguage,
} = require('../config/learningLanguage');
const { getCompanionProfile: getLegacyCompanionProfile } = require('../constants/companions');
const {
  getCompanionProfileSync,
  getCompanionDocSync,
  loadCompanionCache,
} = require('../services/companionCatalogService');
const {
  generateOpeningStory,
  resolveFallbackOpeningStory,
} = require('../services/openingStoryService');
const { resolveCompanionPrompt } = require('../constants/resolveCompanionPrompt');

const getCompanionProfile = (companionId, learningLanguage = 'English') =>
  getCompanionProfileSync(companionId, learningLanguage) || getLegacyCompanionProfile(companionId);

/** Prefer onboarding learning language; fall back to client hint if DB empty. */
const resolveChatTargetLanguage = (user, clientLearningLanguage) => {
  const fromUser =
    typeof user?.onboarding?.language === 'string' ? user.onboarding.language.trim() : '';
  if (fromUser) {
    return normalizeLearningLanguage(fromUser);
  }
  const fromClient =
    typeof clientLearningLanguage === 'string' ? clientLearningLanguage.trim() : '';
  if (fromClient) {
    return normalizeLearningLanguage(fromClient);
  }
  return resolveLearningLanguage(user);
};
const {
  applySkillUpdates,
  buildSkillPayload,
  hasUpdates,
  resolveSkillActivityUpdates,
  recordSkillActivity,
  recordVoiceCallSummary,
} = require('../services/skillScoreService');
const { sanitizeInterviewTeacherSetup } = require('../utils/interviewTeacherSetup');
const { sanitizeCompanionBondStates, clampBondLevel, clampBondSensitivityLevel } = require('../utils/companionBondState');
const { computeBondDeltaFromSentiment } = require('../utils/bondEvaluation');
const { buildBondEmotionContext } = require('../utils/bondPromptContext');
const {
  sanitizeChatSessions,
  upsertChatSessionMessages,
  upsertOpeningStoryMessage,
  isOpeningStoryMessage,
  OPENING_STORY_ID_PREFIX,
  removeChatSessions,
  mergeChatArchiveState,
} = require('../utils/chatSessionState');
const {
  CHAT_HISTORY_CACHE_LIMIT,
  resolveChatHistoryForAi,
  syncChatHistoryCache,
  deleteCachedChatHistories,
  messagesToHistory,
} = require('../services/chatHistoryCache');

const formatIdr = amount => `Rp${Number(amount).toLocaleString('id-ID')}`;
const formatTokens = tokens => (tokens >= 1000000 ? `${tokens / 1000000}M` : `${Math.round(tokens / 1000)}K`);

/** Plan cards for the app, built from config/voicePlans.js (single source of truth). */
const buildSubscriptionPlans = () => {
  const perMinute = estimateVoiceTokensPerMinute();
  return Object.values(VOICE_PLANS).map(plan => ({
    id: plan.id,
    name: plan.name,
    price: `${formatIdr(plan.priceIdr)} / month`,
    priceIdr: plan.priceIdr,
    voiceTokens: plan.voiceTokens,
    voiceTokensLabel: formatTokens(plan.voiceTokens),
    approxMinutes: Math.round(plan.voiceTokens / perMinute),
  }));
};

const resolveVoiceVariant = companionId => resolveVoiceVariantForCompanion(companionId);

const normalizeText = value =>
  (typeof value === 'string' ? value : '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const unclearVoiceReply = 'I do not understand what you said. Please repeat your sentence clearly.';
const fillerVoiceWords = new Set(['uh', 'um', 'umm', 'hmm', 'hm', 'ah', 'eh', 'er']);
const clearShortVoiceWords = new Set(['hi', 'ok', 'no', 'yes']);

const transcriptsMatchForEagerReuse = (finalText, eagerText) => {
  const a = String(finalText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const b = String(eagerText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return a.length > 0 && a === b;
};

const isUnclearVoiceTranscript = value => {
  const clean = normalizeText(value);
  if (!clean) {
    return true;
  }

  const tokens = clean.split(' ').filter(Boolean);
  if (!tokens.length) {
    return true;
  }
  if (tokens.every(token => fillerVoiceWords.has(token))) {
    return true;
  }

  const lettersOnly = clean.replace(/[^a-z]/g, '');
  if (lettersOnly.length >= 4 && !/[aeiou]/.test(lettersOnly)) {
    return true;
  }
  if (tokens.length === 1 && tokens[0].length <= 2 && !clearShortVoiceWords.has(tokens[0])) {
    return true;
  }
  if (/([a-z])\1{4,}/.test(lettersOnly)) {
    return true;
  }

  return false;
};

const saveInterviewTeacherSetup = async (req, res) => {
  const { userId } = req.params;
  const { targetJob, difficultyLevel } = req.body || {};
  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  const job = typeof targetJob === 'string' ? targetJob.trim().slice(0, 120) : '';
  const level = typeof difficultyLevel === 'string' ? difficultyLevel.trim().toLowerCase() : '';

  if (!job || job.length < 2) {
    return res.status(400).json({ message: 'Target job is required.' });
  }
  if (!['junior', 'senior', 'professional'].includes(level)) {
    return res.status(400).json({ message: 'Invalid difficulty level.' });
  }

  user.interviewTeacherSetup = {
    targetJob: job,
    difficultyLevel: level,
    updatedAt: new Date(),
  };
  await user.save();

  return res.status(200).json({
    message: 'Interview setup saved.',
    interviewTeacherSetup: sanitizeInterviewTeacherSetup(user.interviewTeacherSetup),
  });
};

const getDashboard = async (req, res) => {
  const { userId } = req.params;
  // Slice messages at query time so Atlas/local Mongo does not ship full chat history on login.
  const user = await User.findById(userId, {
    'dashboard.chats.messages': { $slice: -40 },
  });

  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }
  if (!user.dashboard) {
    user.dashboard = {};
    await User.updateOne({ _id: userId }, { $set: { dashboard: {} } });
  }
  // Convert legacy call seconds / refill a rolled-over plan before reporting the balance.
  const voiceBalance = await syncVoiceBalance(userId).catch(() => null);
  if (voiceBalance) {
    user.dashboard.voiceTokens = voiceBalance.voiceTokens;
    user.dashboard.voicePeriodEndsAt = voiceBalance.voicePeriodEndsAt;
    user.dashboard.isPremium = voiceBalance.isPremium;
    user.dashboard.subscriptionCancelAtPeriodEnd = voiceBalance.cancelAtPeriodEnd;
    user.dashboard.bonusCallSeconds = 0;
  }
  // Everyone starts with a hello from Nami in the Chat tab.
  const welcomeChat = await ensureWelcomeTeacherChat(userId).catch(error => {
    console.warn('[welcome-teacher] seed failed', error?.message);
    return null;
  });
  if (welcomeChat) {
    user.dashboard.chats = [welcomeChat, ...(user.dashboard.chats || [])];
  }

  return res.status(200).json({
    message: 'Dashboard data ditemukan.',
    dashboard: sanitizeDashboard(user),
    plans: buildSubscriptionPlans(),
  });
};

const USER_SAVE_MAX_ATTEMPTS = 4;

/**
 * Load → mutate → save a user, retrying on VersionError. The app saves the same
 * user document from several places at once (debounced dashboard sync, chat turns,
 * opening stories, deletes); on a conflict we reload and re-apply the change.
 * `mutate` returns false to abort without saving. Resolves to the saved user, or null if missing.
 */
const saveUserWithRetry = async (userId, mutate) => {
  for (let attempt = 0; attempt < USER_SAVE_MAX_ATTEMPTS; attempt += 1) {
    const user = await User.findById(userId);
    if (!user) {
      return null;
    }
    if (!user.dashboard) {
      user.dashboard = {};
    }
    if (mutate(user) === false) {
      return user;
    }
    try {
      await user.save();
      return user;
    } catch (error) {
      if (error?.name === 'VersionError' && attempt < USER_SAVE_MAX_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }
  return null;
};

const saveDashboard = async (req, res) => {
  const { userId } = req.params;
  const {
    remainingTokens,
    chats,
    savedCharacterIds,
    archivedChatListIds,
    companionBondStates,
  } = req.body || {};

  let user;
  try {
    user = await saveUserWithRetry(userId, current => {
      const dashboard = current.dashboard;
      if (Number.isFinite(remainingTokens)) {
        dashboard.remainingTokens = Math.max(0, remainingTokens);
      }
      if (Array.isArray(chats) || Array.isArray(archivedChatListIds)) {
        const mergedArchive = mergeChatArchiveState(
          Array.isArray(chats) ? chats : dashboard.chats,
          Array.isArray(archivedChatListIds)
            ? archivedChatListIds
            : dashboard.archivedChatListIds,
          dashboard.chats,
        );
        dashboard.chats = mergedArchive.chats;
        dashboard.archivedChatListIds = mergedArchive.archivedChatListIds;
      }
      if (Array.isArray(savedCharacterIds)) {
        dashboard.savedCharacterIds = savedCharacterIds.map(String).filter(Boolean).slice(0, 200);
      }
      if (companionBondStates && typeof companionBondStates === 'object') {
        dashboard.companionBondStates = sanitizeCompanionBondStates(companionBondStates);
      }
    });
  } catch (error) {
    console.error('[dashboard] save failed:', { userId, name: error?.name, message: error?.message });
    return res.status(500).json({ message: 'Gagal menyimpan dashboard. Coba lagi.' });
  }
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  return res.status(200).json({
    message: 'Dashboard data berhasil disimpan.',
    dashboard: sanitizeDashboard(user),
  });
};

const transcribeSpeech = async (req, res) => {
  const { userId } = req.params;
  const { transcript, audioBase64, audioMimeType } = req.body || {};

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  const learningLanguage = resolveLearningLanguage(user);
  const sttLanguage = resolveDeepgramSttLanguage(learningLanguage);

  let recognizedText = typeof transcript === 'string' ? transcript.trim() : '';

  try {
    if (!recognizedText && typeof audioBase64 === 'string' && audioBase64.trim()) {
      const normalizedBase64 = normalizeBase64Audio(audioBase64);
      const audioBuffer = Buffer.from(normalizedBase64, 'base64');
      recognizedText = await transcribeAudioWithDeepgram({
        audioBuffer,
        mimeType: typeof audioMimeType === 'string' && audioMimeType.trim() ? audioMimeType : 'audio/wav',
        language: sttLanguage,
      });
    }

    if (!recognizedText) {
      return res.status(400).json({ message: 'Transcript atau audio diperlukan untuk transkripsi.' });
    }

    return res.status(200).json({
      transcript: recognizedText,
    });
  } catch (error) {
    if (error?.code === 'DEEPGRAM_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'Deepgram API belum dikonfigurasi di backend.' });
    }
    if (error?.code === 'DEEPGRAM_NETWORK_FAILED') {
      return res.status(502).json({
        message:
          'Gagal terhubung ke Deepgram (network). Cek koneksi internet server/backend lalu coba lagi.',
      });
    }
    return res.status(502).json({
      message: error?.message || 'Gagal memproses STT Deepgram. Coba lagi.',
    });
  }
};

const synthesizeChatTts = async (req, res) => {
  const { userId } = req.params;
  const { text, speed = 1, model, pronunciations = [], companionId, encoding } = req.body || {};

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ message: 'TTS text is required.' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ message: 'TTS text is too long. Max 2000 characters.' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  const learningLanguage = resolveLearningLanguage(user);
  const voiceVariant = resolveVoiceVariant(companionId);
  const requestedEncoding =
    typeof encoding === 'string' && encoding.trim()
      ? encoding.trim().toLowerCase()
      : 'mp3';

  try {
    const result = await synthesizeSpeech({
      text: text.trim(),
      speed,
      model,
      pronunciations,
      learningLanguage,
      voiceVariant,
      user,
      encoding: requestedEncoding,
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error?.code === 'DEEPGRAM_NOT_CONFIGURED' || error?.code === 'GOOGLE_TTS_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'Layanan TTS belum dikonfigurasi di backend.' });
    }
    if (error?.code === 'DEEPGRAM_TTS_SPEED_INVALID' || error?.code === 'GOOGLE_TTS_SPEED_INVALID') {
      return res.status(400).json({ message: error.message });
    }
    if (error?.code === 'DEEPGRAM_NETWORK_FAILED') {
      return res.status(502).json({
        message:
          'Gagal terhubung ke Deepgram (network). Cek koneksi internet server/backend lalu coba lagi.',
      });
    }
    if (error?.code === 'GOOGLE_TTS_API_DISABLED') {
      return res.status(503).json({
        message: 'Google Cloud Text-to-Speech API belum diaktifkan untuk project ini.',
      });
    }
    if (error?.code === 'GOOGLE_TTS_UNAUTHENTICATED') {
      return res.status(503).json({
        message:
          'Google TTS credentials tidak valid. Ganti secrets/google-tts-credentials.json dengan service account key yang aktif.',
      });
    }
    return res.status(502).json({
      message: error?.message || 'Gagal membuat audio TTS.',
    });
  }
};

const finalizeVoiceCallWithReplyText = async ({
  transcript,
  reply,
  speed = 1,
  model,
  pronunciations = [],
  skipTts = false,
  user,
  companionId,
}) => {
  const misunderstood = reply === unclearVoiceReply;
  const learningLanguage = user ? resolveLearningLanguage(user) : 'English';
  const voiceVariant = resolveVoiceVariant(companionId);
  const resolvedModel = user ? resolveTtsModelForUser(user, model, voiceVariant) : model;
  if (skipTts) {
    return {
      transcript,
      reply,
      ...(misunderstood ? { misunderstood: true } : {}),
      audioBase64: '',
      mimeType: 'audio/mpeg',
      ttsError: null,
    };
  }
  const spoken = misunderstood ? unclearVoiceReply : reply;
  const pron = misunderstood ? [] : pronunciations;

  let ttsResult = {
    audioBase64: '',
    mimeType: 'audio/mpeg',
    ttsError: null,
  };
  try {
    ttsResult = await synthesizeSpeech({
      text: spoken,
      speed,
      model: resolvedModel,
      pronunciations: pron,
      learningLanguage,
      voiceVariant,
      user,
    });
  } catch (ttsError) {
    ttsResult.ttsError = 'Voice output is temporarily unavailable.';
  }

  return {
    transcript,
    reply,
    ...(misunderstood ? { misunderstood: true } : {}),
    ...ttsResult,
  };
};

/** Fire on Flux EagerEndOfTurn; reuse when final STT text matches snapshot (normalized). */
const prefetchVoiceCallDeepseek = async ({
  userId,
  transcript,
  companionId,
  companionName,
  companionDescription,
  companionPrompt,
  history = [],
}) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return null;
    }
    const targetLanguage = resolveChatTargetLanguage(user, undefined);
    await loadCompanionCache();
    const trustedCompanion = getCompanionProfile(companionId, targetLanguage);
    const clean = String(transcript || '').trim();
    if (!clean || clean.length > CHAT_MAX_INPUT) {
      return null;
    }
    if (isUnclearVoiceTranscript(clean)) {
      return unclearVoiceReply;
    }
    return await requestDeepseekReply({
      message: clean,
      companionId,
      companionName: trustedCompanion?.name || companionName,
      companionDescription: trustedCompanion?.description || companionDescription,
      companionPrompt: resolveCompanionPrompt(companionId, companionPrompt, targetLanguage),
      targetLanguage,
      history,
      timeoutMs: DEEPSEEK_VOICE_TIMEOUT_MS,
      historyLimit: DEEPSEEK_VOICE_HISTORY_LIMIT,
      maxTokens: DEEPSEEK_VOICE_MAX_TOKENS,
      forVoice: true,
    });
  } catch {
    return null;
  }
};

const processVoiceCallFromTranscript = async (
  {
    userId,
    user: existingUser,
    transcript,
    companionId,
    companionName,
    companionDescription,
    companionPrompt,
    history = [],
    speed = 1,
    model,
    pronunciations = [],
  },
  streamCallbacks = null,
) => {
  const onAiDelta =
    streamCallbacks && typeof streamCallbacks.onAiDelta === 'function' ? streamCallbacks.onAiDelta : null;
  const skipTts = Boolean(streamCallbacks && streamCallbacks.skipTts);

  const user = existingUser || (await User.findById(userId));
  if (!user) {
    const error = new Error('User tidak ditemukan.');
    error.statusCode = 404;
    throw error;
  }

  const targetLanguage = resolveChatTargetLanguage(user, undefined);
  await loadCompanionCache();
  const trustedCompanion = getCompanionProfile(companionId, targetLanguage);
  const learningLanguage = targetLanguage;
  const voiceVariant = resolveVoiceVariant(companionId);
  const resolvedModel = resolveTtsModelForUser(user, model, voiceVariant);
  const cleanTranscript = String(transcript || '').trim();

  if (!cleanTranscript) {
    const error = new Error('Suara belum terdengar jelas. Coba bicara lagi.');
    error.statusCode = 400;
    throw error;
  }
  if (cleanTranscript.length > CHAT_MAX_INPUT) {
    const error = new Error('Pesan suara terlalu panjang. Coba lebih singkat.');
    error.statusCode = 400;
    throw error;
  }

  if (isUnclearVoiceTranscript(cleanTranscript)) {
    let ttsResult = {
      audioBase64: '',
      mimeType: 'audio/mpeg',
      ttsError: null,
    };
    try {
      ttsResult = await synthesizeSpeech({
        text: unclearVoiceReply,
        speed,
        model: resolvedModel,
        pronunciations: [],
        learningLanguage,
        voiceVariant,
        user,
      });
    } catch (ttsError) {
      ttsResult.ttsError = 'Voice output is temporarily unavailable.';
    }

    return {
      transcript: cleanTranscript,
      reply: unclearVoiceReply,
      misunderstood: true,
      ...ttsResult,
    };
  }

  const deepseekParams = {
    message: cleanTranscript,
    companionId,
    companionName: trustedCompanion?.name || companionName,
    companionDescription: trustedCompanion?.description || companionDescription,
    companionPrompt: resolveCompanionPrompt(companionId, companionPrompt, targetLanguage),
    targetLanguage,
    history,
    timeoutMs: DEEPSEEK_VOICE_TIMEOUT_MS,
    historyLimit: DEEPSEEK_VOICE_HISTORY_LIMIT,
    maxTokens: DEEPSEEK_VOICE_MAX_TOKENS,
    forVoice: true,
  };

  const reply = onAiDelta
    ? await requestDeepseekReplyStreaming({
        ...deepseekParams,
        onDelta: onAiDelta,
      })
    : await requestDeepseekReply(deepseekParams);

  if (skipTts) {
    return {
      transcript: cleanTranscript,
      reply,
      audioBase64: '',
      mimeType: 'audio/mpeg',
      ttsError: null,
    };
  }

  let ttsResult = {
    audioBase64: '',
    mimeType: 'audio/mpeg',
    ttsError: null,
  };
  try {
    ttsResult = await synthesizeSpeech({
      text: reply,
      speed,
      model: resolvedModel,
      pronunciations,
      learningLanguage,
      voiceVariant,
      user,
    });
  } catch (ttsError) {
    ttsResult.ttsError = 'Voice output is temporarily unavailable.';
  }

  return {
    transcript: cleanTranscript,
    reply,
    ...ttsResult,
  };
};

const processVoiceCallTurn = async ({
  userId,
  audioBase64,
  audioMimeType,
  companionId,
  companionName,
  companionDescription,
  companionPrompt,
  history = [],
  speed = 1,
  model,
  pronunciations = [],
}) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User tidak ditemukan.');
    error.statusCode = 404;
    throw error;
  }
  const sanitized = sanitizeTeacherCallPayload({ history, callChatTopic: null }, user);
  if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
    const error = new Error('Audio diperlukan untuk voice call.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedBase64 = normalizeBase64Audio(audioBase64);
  const audioBuffer = Buffer.from(normalizedBase64, 'base64');
  const learningLanguage = resolveLearningLanguage(user);
  const transcript = await transcribeAudioWithDeepgram({
    audioBuffer,
    mimeType: typeof audioMimeType === 'string' && audioMimeType.trim() ? audioMimeType : 'audio/wav',
    preferRest: true,
    language: resolveDeepgramSttLanguage(learningLanguage),
  });

  return processVoiceCallFromTranscript({
    user,
    userId,
    transcript,
    companionId,
    companionName,
    companionDescription,
    companionPrompt,
    history: sanitized.history,
    speed,
    model,
    pronunciations,
  });
};

const voiceCallWithAi = async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await processVoiceCallTurn({
      userId,
      ...(req.body || {}),
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error?.code === 'DEEPGRAM_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'Deepgram API belum dikonfigurasi di backend.' });
    }
    if (error?.code === 'DEEPSEEK_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'Layanan AI belum dikonfigurasi di backend.' });
    }
    if (error?.code === 'DEEPGRAM_TTS_SPEED_INVALID') {
      return res.status(400).json({ message: error.message });
    }
    if (error?.code === 'DEEPGRAM_NETWORK_FAILED') {
      console.warn('[voice-call] STT network failed:', error.message);
      return res.status(502).json({
        message: 'Suara belum bisa diproses. Coba bicara lagi.',
      });
    }
    if (error?.code === 'DEEPGRAM_REQUEST_FAILED') {
      console.warn('[voice-call] STT request failed:', error.message);
      return res.status(502).json({
        message: 'Suara belum bisa diproses. Coba bicara lagi.',
      });
    }
    return res.status(502).json({
      message: 'Suara belum bisa diproses. Coba bicara lagi.',
    });
  }
};

const PERSIST_CHAT_MAX_ATTEMPTS = 4;

const persistChatTurnWithRetry = async ({
  userId,
  companionRow,
  userText,
  aiText,
  skillUpdates = {},
  skillLanguage,
}) => {
  for (let attempt = 0; attempt < PERSIST_CHAT_MAX_ATTEMPTS; attempt += 1) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }
    if (!user.dashboard) {
      user.dashboard = {};
    }

    if (hasUpdates(skillUpdates)) {
      applySkillUpdates(user, skillUpdates, skillLanguage);
    }

    user.dashboard.chats = upsertChatSessionMessages(user.dashboard.chats || [], {
      companion: companionRow,
      userText,
      aiText,
    });
    const mergedArchive = mergeChatArchiveState(
      user.dashboard.chats,
      user.dashboard.archivedChatListIds,
      user.dashboard.chats,
    );
    user.dashboard.chats = mergedArchive.chats;
    user.dashboard.archivedChatListIds = mergedArchive.archivedChatListIds;
    const savedSession = (user.dashboard.chats || []).find(
      item => item?.companion?.id === companionRow.id,
    );

    try {
      await user.save();
      if (companionRow?.id && savedSession?.messages) {
        void syncChatHistoryCache({
          userId,
          companionId: companionRow.id,
          messages: savedSession.messages,
        });
      }
      return {
        ...buildSkillPayload(user, skillLanguage),
        chatSessionId: savedSession?.id || null,
      };
    } catch (error) {
      const isVersionConflict = error?.name === 'VersionError';
      if (isVersionConflict && attempt < PERSIST_CHAT_MAX_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }

  const error = new Error('Gagal menyimpan chat setelah beberapa percobaan.');
  error.code = 'CHAT_PERSIST_CONFLICT';
  throw error;
};

const chatWithAi = async (req, res) => {
  const { userId } = req.params;
  const {
    message,
    companionId,
    companionName,
    companionDescription,
    companionPrompt,
    history = [],
    bondLevel,
    bondIncreaseLevel,
    bondDecreaseLevel,
    learningLanguage: clientLearningLanguage,
  } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ message: 'Pesan chat tidak valid.' });
  }
  if (message.trim().length > CHAT_MAX_INPUT) {
    return res.status(400).json({ message: 'Pesan terlalu panjang. Maksimal 300 karakter.' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  const targetLanguage = resolveChatTargetLanguage(user, clientLearningLanguage);
  await loadCompanionCache();
  const trustedCompanion = getCompanionProfile(companionId, targetLanguage);
  const trimmedMessage = message.trim();
  const companionRow = {
    id: trustedCompanion?.id || String(companionId || '').trim(),
    name: trustedCompanion?.name || companionName || 'Companion',
    type: trustedCompanion?.type === 'teacher' ? 'teacher' : 'character',
    image: trustedCompanion?.image || '',
    description: trustedCompanion?.description || companionDescription || '',
  };
  const skillUpdates = resolveSkillActivityUpdates(
    { source: 'chat', message: trimmedMessage },
    targetLanguage,
  );

  try {
    const isCharacter = companionRow.type === 'character';
    const sensitivity = {
      bondIncreaseLevel: clampBondSensitivityLevel(bondIncreaseLevel),
      bondDecreaseLevel: clampBondSensitivityLevel(bondDecreaseLevel),
    };
    const bondContext = isCharacter
      ? buildBondEmotionContext({
          bond: clampBondLevel(bondLevel),
          bondIncreaseLevel: sensitivity.bondIncreaseLevel,
          bondDecreaseLevel: sensitivity.bondDecreaseLevel,
          companionName: companionRow.name,
        })
      : '';
    const bondSentimentPromise = isCharacter
      ? evaluateBondSentimentWithAi({
          message: trimmedMessage,
          companionName: companionRow.name,
          companionDescription: companionRow.description,
          bondIncreaseLevel: sensitivity.bondIncreaseLevel,
          bondDecreaseLevel: sensitivity.bondDecreaseLevel,
        })
      : Promise.resolve(0);

    const mongoSession = (user.dashboard?.chats || []).find(
      item => item?.companion?.id === companionRow.id,
    );
    // Memory follows the subscription: how many recent messages + long-term facts.
    const memoryTier = resolveMemoryTier(user);
    await attachCompanionMemory(user, companionRow.id).catch(() => []);
    const { history: resolvedHistory, source: historySource } = await resolveChatHistoryForAi({
      userId,
      companionId: companionRow.id,
      clientHistory: history,
      mongoMessages: mongoSession?.messages || [],
      limit: Math.min(memoryTier.recentMessages, CHAT_HISTORY_CACHE_LIMIT),
    });
    // Tiers deeper than the Redis cache read straight from the stored conversation.
    const tierHistory =
      memoryTier.recentMessages > CHAT_HISTORY_CACHE_LIMIT && mongoSession?.messages?.length
        ? messagesToHistory(mongoSession.messages, memoryTier.recentMessages)
        : resolvedHistory;
    if (historySource === 'redis') {
      console.log('[chat] history-cache hit', {
        userId,
        companionId: companionRow.id,
        count: resolvedHistory.length,
      });
    }

    const [reply, bondSentiment] = await Promise.all([
      requestDeepseekReply({
        message: trimmedMessage,
        companionId,
        companionName: companionRow.name,
        companionDescription: companionRow.description,
        companionPrompt: resolveCompanionPrompt(companionId, companionPrompt, targetLanguage),
        targetLanguage,
        history: tierHistory,
        historyLimit: memoryTier.recentMessages,
        forVoice: false,
        user,
        bondContext,
      }),
      bondSentimentPromise,
    ]);

    const bondDelta = isCharacter
      ? computeBondDeltaFromSentiment(bondSentiment, sensitivity)
      : 0;

    const { skillScores, skillBreakdown, chatSessionId } = await persistChatTurnWithRetry({
      userId,
      companionRow,
      userText: trimmedMessage,
      aiText: reply,
      skillUpdates,
      skillLanguage: targetLanguage,
    });
    void recordTurnForMemory({
      user,
      companionId: companionRow.id,
      companionName: companionRow.name,
      history: [
        ...tierHistory,
        { role: 'user', text: trimmedMessage },
        { role: 'ai', text: reply },
      ],
    }).catch(() => {});
    return res.status(200).json({
      reply,
      skillScores,
      skillBreakdown,
      chatSessionId,
      bondDelta,
      bondSentiment,
    });
  } catch (error) {
    console.error('[chat] failed:', {
      userId,
      companionId,
      code: error?.code,
      name: error?.name,
      message: error?.message,
    });
    if (error?.statusCode === 404) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }
    if (error?.code === 'DEEPSEEK_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'Layanan AI belum dikonfigurasi di backend.' });
    }
    if (error?.name === 'ValidationError' || error?.code === 'CHAT_PERSIST_CONFLICT') {
      return res.status(500).json({ message: 'Gagal menyimpan chat. Coba lagi.' });
    }
    return res.status(502).json({ message: 'Gagal mendapatkan respons AI. Coba lagi.' });
  }
};

/** userId:companion:language → in-flight generation, so a double tap never pays for two stories. */
const openingStoryInflight = new Map();

const findCompanionSession = (user, companionId) =>
  (user?.dashboard?.chats || []).find(item => item?.companion?.id === companionId) || null;

/** Opening story already seeded, or the user has spoken — never regenerate in either case. */
const resolveExistingOpening = session => {
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  const opening = messages.find(isOpeningStoryMessage);
  if (opening) {
    return opening;
  }
  if (messages.some(item => item?.role === 'user')) {
    return messages.find(item => item?.role === 'ai') || null;
  }
  return null;
};

const persistOpeningStoryWithRetry = async ({ userId, companionRow, story, messageId }) => {
  for (let attempt = 0; attempt < PERSIST_CHAT_MAX_ATTEMPTS; attempt += 1) {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }
    if (!user.dashboard) {
      user.dashboard = {};
    }
    const before = findCompanionSession(user, companionRow.id);
    if (resolveExistingOpening(before)) {
      return before;
    }

    user.dashboard.chats = upsertOpeningStoryMessage(user.dashboard.chats || [], {
      companion: companionRow,
      aiText: story,
      messageId,
    });
    const mergedArchive = mergeChatArchiveState(
      user.dashboard.chats,
      user.dashboard.archivedChatListIds,
      user.dashboard.chats,
    );
    user.dashboard.chats = mergedArchive.chats;
    user.dashboard.archivedChatListIds = mergedArchive.archivedChatListIds;
    const saved = findCompanionSession(user, companionRow.id);

    try {
      await user.save();
      if (saved?.messages) {
        void syncChatHistoryCache({
          userId,
          companionId: companionRow.id,
          messages: saved.messages,
        });
      }
      return saved;
    } catch (error) {
      if (error?.name === 'VersionError' && attempt < PERSIST_CHAT_MAX_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }
  return null;
};

/**
 * First-chat opening scene for a character, written by the AI in the learner's
 * target language and shaped by bond + profile. Idempotent per thread.
 */
const createOpeningStory = async (req, res) => {
  const { userId } = req.params;
  const {
    companionId,
    learningLanguage: clientLearningLanguage,
    bondLevel,
    bondIncreaseLevel,
    bondDecreaseLevel,
    localHour,
  } = req.body || {};
  const slug = typeof companionId === 'string' ? companionId.trim() : '';
  if (!slug) {
    return res.status(400).json({ message: 'Character tidak valid.' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  await loadCompanionCache();
  const doc = getCompanionDocSync(slug);
  if (!doc || doc.type !== 'character') {
    return res.status(404).json({ message: 'Character tidak ditemukan.' });
  }

  const targetLanguage = resolveChatTargetLanguage(user, clientLearningLanguage);
  const existingSession = findCompanionSession(user, slug);
  const existing = resolveExistingOpening(existingSession);
  if (existing?.text) {
    return res.status(200).json({
      story: existing.text,
      messageId: existing.id,
      chatSessionId: existingSession?.id || null,
      reused: true,
      fallback: false,
      language: targetLanguage,
    });
  }

  const inflightKey = `${userId}:${slug}:${targetLanguage}`;
  let job = openingStoryInflight.get(inflightKey);
  if (!job) {
    job = (async () => {
      const storedBond = user.dashboard?.companionBondStates?.[slug] || {};
      const pickNumber = (...values) => values.find(value => Number.isFinite(Number(value)));
      const bond = clampBondLevel(pickNumber(bondLevel, storedBond.bond, doc.bondDefault));
      const companionRow = {
        id: slug,
        name: doc.name,
        type: 'character',
        image: doc.image || '',
        description: doc.description || '',
      };

      try {
        const story = await generateOpeningStory({
          doc,
          targetLanguage,
          user,
          bond,
          bondIncreaseLevel: clampBondSensitivityLevel(
            pickNumber(bondIncreaseLevel, storedBond.bondIncreaseLevel, doc.bondIncreaseLevel),
          ),
          bondDecreaseLevel: clampBondSensitivityLevel(
            pickNumber(bondDecreaseLevel, storedBond.bondDecreaseLevel, doc.bondDecreaseLevel),
          ),
          localHour,
        });
        const messageId = `${OPENING_STORY_ID_PREFIX}${Date.now().toString(36)}`;
        const saved = await persistOpeningStoryWithRetry({
          userId,
          companionRow,
          story,
          messageId,
        });
        const seeded = resolveExistingOpening(saved);
        return {
          story: seeded?.text || story,
          messageId: seeded?.id || messageId,
          chatSessionId: saved?.id || null,
          reused: false,
          fallback: false,
          language: targetLanguage,
        };
      } catch (error) {
        console.warn('[opening-story] generation failed, using canon story:', {
          userId,
          companionId: slug,
          language: targetLanguage,
          code: error?.code,
          message: error?.message,
        });
        // Not persisted on purpose: the next first-open retries the AI version.
        return {
          story: resolveFallbackOpeningStory(doc, targetLanguage),
          messageId: null,
          chatSessionId: existingSession?.id || null,
          reused: false,
          fallback: true,
          language: targetLanguage,
        };
      }
    })().finally(() => {
      openingStoryInflight.delete(inflightKey);
    });
    openingStoryInflight.set(inflightKey, job);
  }

  const result = await job;
  if (!result.story) {
    return res.status(502).json({ message: 'Gagal membuat cerita pembuka. Coba lagi.' });
  }
  return res.status(200).json(result);
};

/** Short-lived Deepgram token for client-direct live STT (StoryRush). No audio relay. */
const getDeepgramSttToken = async (req, res) => {
  const { userId } = req.params;
  const learningLanguage =
    typeof req.query?.learningLanguage === 'string'
      ? req.query.learningLanguage
      : undefined;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  const resolvedLanguage = learningLanguage || resolveLearningLanguage(user);
  const sttLanguage = resolveDeepgramSttLanguage(resolvedLanguage);
  const endpointingMs = Number(getEnv('STORY_RUSH_DEEPGRAM_ENDPOINTING_MS', '120')) || 120;

  try {
    const grant = await createDeepgramSttGrant({ ttlSeconds: 300 });
    return res.status(200).json({
      mode: 'direct',
      accessToken: grant.accessToken,
      expiresIn: grant.expiresIn,
      sttLanguage,
      endpointingMs,
      listenUrl: getListenLiveWsUrl(),
      model: getEnv('DEEPGRAM_STREAM_MODEL', 'nova-3'),
    });
  } catch (error) {
    if (error?.code === 'DEEPGRAM_GRANT_FAILED' || error?.code === 'DEEPGRAM_NETWORK_FAILED') {
      console.warn('[deepgram-stt-token] direct STT unavailable, using backend relay:', error.message);
      return res.status(200).json({
        mode: 'relay',
        sttLanguage,
        endpointingMs,
      });
    }
    console.error('[deepgram-stt-token] failed:', {
      userId,
      code: error?.code,
      message: error?.message,
    });
    if (error?.code === 'DEEPGRAM_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'Deepgram API belum dikonfigurasi di backend.' });
    }
    if (error?.code === 'DEEPGRAM_NETWORK_FAILED') {
      return res.status(502).json({
        message: 'Backend tidak bisa terhubung ke Deepgram. Cek internet / DEEPGRAM_API_KEY.',
      });
    }
    if (error?.code === 'DEEPGRAM_GRANT_FAILED') {
      return res.status(502).json({
        message: 'Token Deepgram ditolak. Periksa DEEPGRAM_API_KEY di backend.',
      });
    }
    return res.status(502).json({
      message: error?.message || 'Could not create Deepgram STT token.',
    });
  }
};

const recordSkillEvent = async (req, res) => {
  const { userId } = req.params;
  const payload = req.body || {};

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  try {
    const skillPayload = await recordSkillActivity(user, payload, {
      language: resolveChatTargetLanguage(user, payload.learningLanguage),
    });
    return res.status(200).json({ success: true, ...skillPayload });
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Gagal memperbarui skill.',
    });
  }
};

const getSkillProgress = async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }
  const language = resolveChatTargetLanguage(user, req.query?.learningLanguage);
  return res.status(200).json({ success: true, ...buildSkillPayload(user, language) });
};

const saveVoiceCallSummary = async (req, res) => {
  const { userId } = req.params;
  const { durationSec = 0, turns = [] } = req.body || {};

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  try {
    const skillPayload = await recordVoiceCallSummary(user, {
      turns: Array.isArray(turns) ? turns : [],
      durationSec: Math.max(0, Number(durationSec) || 0),
      language: resolveChatTargetLanguage(user, req.body?.learningLanguage),
    });
    return res.status(200).json({ success: true, ...skillPayload });
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Gagal menyimpan ringkasan panggilan.',
    });
  }
};

const deleteChatSessions = async (req, res) => {
  const { userId } = req.params;
  const { sessionIds = [], archivedChatListIds } = req.body || {};
  const removeSet = new Set(
    (Array.isArray(sessionIds) ? sessionIds : []).map(id => String(id).trim()).filter(Boolean),
  );

  let removedCompanionIds = [];
  let user;
  try {
    user = await saveUserWithRetry(userId, current => {
      const dashboard = current.dashboard;
      // Recomputed on every attempt: a retry sees the freshly reloaded chats.
      removedCompanionIds = (dashboard.chats || [])
        .filter(item => removeSet.has(String(item?.id || '').trim()))
        .map(item => item?.companion?.id)
        .filter(Boolean);
      dashboard.chats = removeChatSessions(dashboard.chats, sessionIds);
      if (Array.isArray(archivedChatListIds)) {
        dashboard.archivedChatListIds = archivedChatListIds
          .map(String)
          .filter(Boolean)
          .slice(0, 200);
      }
    });
  } catch (error) {
    console.error('[dashboard] delete chats failed:', { userId, name: error?.name, message: error?.message });
    return res.status(500).json({ message: 'Gagal menghapus chat. Coba lagi.' });
  }
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }
  void deleteCachedChatHistories(userId, removedCompanionIds);
  void clearCompanionMemory(userId, removedCompanionIds);

  return res.status(200).json({
    message: 'Chat berhasil dihapus.',
    dashboard: sanitizeDashboard(user),
  });
};

const getVoiceTokenBalance = async (req, res) => {
  const balance = await syncVoiceBalance(req.params.userId).catch(() => null);
  if (!balance) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }
  return res.status(200).json({ success: true, ...balance });
};

/**
 * Activates a monthly plan and loads its voice tokens.
 * NOTE: there is no payment verification yet — wire Google Play Billing receipts here
 * before launch, otherwise anyone can grant themselves a plan.
 */
const activateSubscriptionPlan = async (req, res) => {
  // Real purchases go through /billing/google/verify. This shortcut is dev-only.
  if (!allowUnverifiedPurchases()) {
    return res.status(403).json({
      message: 'Gunakan pembelian Google Play.',
      code: 'BILLING_VERIFICATION_REQUIRED',
    });
  }
  try {
    const balance = await activateVoicePlan(req.params.userId, String(req.body?.planId || ''));
    return res.status(200).json({ success: true, planId: req.body?.planId, ...balance });
  } catch (error) {
    return res.status(error?.status || 500).json({ message: error?.message || 'Gagal mengaktifkan paket.' });
  }
};

const cancelSubscription = async (req, res) => {
  try {
    // Play-billed: stop auto-renew at Google first, then mirror it locally.
    await cancelUserGoogleSubscription(req.params.userId);
    const balance = await setSubscriptionCancelAtPeriodEnd(req.params.userId, true);
    return res.status(200).json({ success: true, ...balance });
  } catch (error) {
    return res.status(error?.status || 500).json({ message: error?.message || 'Gagal membatalkan langganan.' });
  }
};

const resumeSubscription = async (req, res) => {
  const owner = await User.findById(req.params.userId).select('dashboard.billingProvider').lean();
  if (owner?.dashboard?.billingProvider === 'google_play') {
    // Google can't un-cancel via API; the user restores it in the Play Store.
    return res.status(409).json({
      message: 'Lanjutkan langganan lewat Google Play Store.',
      code: 'BILLING_RESUME_IN_PLAY_STORE',
      manageUrl: `https://play.google.com/store/account/subscriptions?package=${getEnv('GOOGLE_PLAY_PACKAGE_NAME', 'com.moocha')}`,
    });
  }
  try {
    const balance = await setSubscriptionCancelAtPeriodEnd(req.params.userId, false);
    return res.status(200).json({ success: true, ...balance });
  } catch (error) {
    return res.status(error?.status || 500).json({ message: error?.message || 'Gagal melanjutkan langganan.' });
  }
};

/** App → after a successful Play Billing purchase: verify the token and activate. */
const verifyGooglePlayPurchase = async (req, res) => {
  try {
    const result = await verifyAndApplyPurchase(req.params.userId, String(req.body?.purchaseToken || ''));
    const balance = await getVoiceTokenBalanceData(req.params.userId);
    return res.status(200).json({ success: true, planId: result.planId, active: result.active, ...balance });
  } catch (error) {
    return res.status(error?.status || 500).json({
      message: error?.message || 'Verifikasi pembayaran gagal.',
      code: error?.code,
    });
  }
};

/** Play subscription product IDs the app should offer, per plan. */
const getGooglePlayProducts = (_req, res) =>
  res.status(200).json({
    success: true,
    products: Object.keys(VOICE_PLANS).map(planId => ({ planId, productId: planToProduct(planId) })),
  });

module.exports = {
  verifyGooglePlayPurchase,
  getGooglePlayProducts,
  cancelSubscription,
  resumeSubscription,
  getVoiceTokenBalance,
  activateSubscriptionPlan,
  getDashboard,
  saveDashboard,
  deleteChatSessions,
  saveInterviewTeacherSetup,
  recordSkillEvent,
  getSkillProgress,
  saveVoiceCallSummary,
  chatWithAi,
  createOpeningStory,
  transcribeSpeech,
  getDeepgramSttToken,
  voiceCallWithAi,
  processVoiceCallTurn,
  processVoiceCallFromTranscript,
  prefetchVoiceCallDeepseek,
  finalizeVoiceCallWithReplyText,
  transcriptsMatchForEagerReuse,
  synthesizeChatTts,
};
