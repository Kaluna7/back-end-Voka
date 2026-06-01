const { getEnv } = require('../config/env');
const { User, sanitizeDashboard } = require('../models/User');
const {
  CHAT_MAX_INPUT,
  DEEPSEEK_VOICE_HISTORY_LIMIT,
  DEEPSEEK_VOICE_MAX_TOKENS,
  DEEPSEEK_VOICE_TIMEOUT_MS,
  requestDeepseekReply,
  requestDeepseekReplyStreaming,
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
} = require('../config/learningLanguage');
const { getCompanionProfile } = require('../constants/companions');
const { resolveCompanionPrompt } = require('../constants/resolveCompanionPrompt');
const { defaultLearnRouteProgress } = require('../constants/dashboardDefaults');
const {
  recordSkillActivity,
  recordVoiceCallSummary,
} = require('../services/skillScoreService');
const { sanitizeInterviewTeacherSetup } = require('../utils/interviewTeacherSetup');

const subscriptionPlans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'Rp75.000 / month',
    voicePerDay: '3 minutes voice per day',
    features: [
      'Unlimited chat',
      'Basic speaking features',
      'No ads',
      'Better AI responses',
      'Daily speaking practice',
      'Priority performance',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'Rp129.000 / month',
    voicePerDay: '7 minutes voice per day',
    features: [
      'Characters included',
      'Faster and more natural AI',
      'No ads',
      'Better AI responses',
      'Daily speaking practice',
      'Priority performance',
    ],
    badge: 'Best Seller',
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'Rp179.000 / month',
    voicePerDay: '15 minutes voice per day',
    features: [
      'All characters',
      'Advanced AI',
      'No ads',
      'Better AI responses',
      'Daily speaking practice',
      'Priority performance',
    ],
  },
];

const resolveVoiceVariant = companionId => resolveVoiceVariantForCompanion(companionId);

const clampProgress = value => Math.max(0, Math.min(100, Number.isFinite(value) ? Number(value) : 0));

const sanitizeProgressGroup = (incoming = {}, fallback = {}) => {
  const sanitized = { ...fallback };
  Object.keys(fallback).forEach(key => {
    sanitized[key] = clampProgress(incoming?.[key]);
  });
  return sanitized;
};

const sanitizeLearnRouteProgress = (incoming, fallback) => {
  const defaultProgress = defaultLearnRouteProgress();
  const safeFallback = fallback && typeof fallback === 'object' ? fallback : defaultProgress;
  if (!incoming || typeof incoming !== 'object') {
    return {
      spelling: sanitizeProgressGroup(safeFallback.spelling, defaultProgress.spelling),
      vocabulary: sanitizeProgressGroup(safeFallback.vocabulary, defaultProgress.vocabulary),
      sentenceExpression: sanitizeProgressGroup(
        safeFallback.sentenceExpression,
        defaultProgress.sentenceExpression,
      ),
      speakingPractice: sanitizeProgressGroup(
        safeFallback.speakingPractice,
        defaultProgress.speakingPractice,
      ),
    };
  }
  return {
    spelling: sanitizeProgressGroup(incoming.spelling, safeFallback.spelling || defaultProgress.spelling),
    vocabulary: sanitizeProgressGroup(
      incoming.vocabulary,
      safeFallback.vocabulary || defaultProgress.vocabulary,
    ),
    sentenceExpression: sanitizeProgressGroup(
      incoming.sentenceExpression,
      safeFallback.sentenceExpression || defaultProgress.sentenceExpression,
    ),
    speakingPractice: sanitizeProgressGroup(
      incoming.speakingPractice,
      safeFallback.speakingPractice || defaultProgress.speakingPractice,
    ),
  };
};

const normalizeText = value =>
  (typeof value === 'string' ? value : '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const calculateSimilarity = (expectedText, actualText) => {
  const expectedTokens = normalizeText(expectedText).split(' ').filter(Boolean);
  const actualTokens = normalizeText(actualText).split(' ').filter(Boolean);

  if (!expectedTokens.length || !actualTokens.length) {
    return 0;
  }

  const expectedCount = new Map();
  expectedTokens.forEach(token => {
    expectedCount.set(token, (expectedCount.get(token) || 0) + 1);
  });
  const actualCount = new Map();
  actualTokens.forEach(token => {
    actualCount.set(token, (actualCount.get(token) || 0) + 1);
  });

  let overlap = 0;
  expectedCount.forEach((value, token) => {
    overlap += Math.min(value, actualCount.get(token) || 0);
  });

  const precision = overlap / actualTokens.length;
  const recall = overlap / expectedTokens.length;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return Math.max(0, Math.min(1, f1));
};

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
  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }
  if (!user.dashboard) {
    user.dashboard = {};
    await user.save();
  }

  return res.status(200).json({
    message: 'Dashboard data ditemukan.',
    dashboard: sanitizeDashboard(user),
    plans: subscriptionPlans,
  });
};

const saveDashboard = async (req, res) => {
  const { userId } = req.params;
  const {
    remainingTokens,
    selectedPlan,
    isPremium,
    lessons,
    chats,
    learnRouteProgress,
    bonusCallSeconds,
  } = req.body;
  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }
  if (!user.dashboard) {
    user.dashboard = {};
  }

  if (Number.isFinite(remainingTokens)) {
    user.dashboard.remainingTokens = Math.max(0, remainingTokens);
  }
  if (typeof selectedPlan === 'string' && ['starter', 'pro', 'premium'].includes(selectedPlan)) {
    user.dashboard.selectedPlan = selectedPlan;
  }
  if (typeof isPremium === 'boolean') {
    user.dashboard.isPremium = isPremium;
    if (!isPremium) {
      user.dashboard.remainingTokens = Math.min(10, Math.max(0, user.dashboard.remainingTokens || 0));
    }
  }
  if (Array.isArray(lessons)) {
    user.dashboard.lessons = lessons;
  }
  if (Array.isArray(chats)) {
    user.dashboard.chats = chats;
  }
  if (learnRouteProgress && typeof learnRouteProgress === 'object') {
    const currentProgress = user.dashboard.learnRouteProgress || defaultLearnRouteProgress();
    user.dashboard.learnRouteProgress = sanitizeLearnRouteProgress(learnRouteProgress, currentProgress);
  }
  if (Number.isFinite(bonusCallSeconds)) {
    user.dashboard.bonusCallSeconds = Math.max(0, Math.floor(bonusCallSeconds));
  }

  await user.save();

  return res.status(200).json({
    message: 'Dashboard data berhasil disimpan.',
    dashboard: sanitizeDashboard(user),
  });
};

const evaluateReadAloud = async (req, res) => {
  const { userId } = req.params;
  const { expectedText, transcript, audioBase64, audioMimeType } = req.body || {};

  if (typeof expectedText !== 'string' || !expectedText.trim()) {
    return res.status(400).json({ message: 'Expected sentence is required.' });
  }

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
      return res.status(400).json({ message: 'Transcript atau audio diperlukan untuk evaluasi.' });
    }

    const similarityScore = calculateSimilarity(expectedText, recognizedText);
    const similarityPercent = Math.round(similarityScore * 100);
    const isMatch = similarityPercent >= 75;

    const skillScores = await recordSkillActivity(user, {
      source: 'practice',
      routeCategory: 'speakingPractice',
      accuracy: similarityPercent,
    });

    return res.status(200).json({
      transcript: recognizedText,
      similarity: similarityPercent,
      isMatch,
      skillScores,
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
    const trustedCompanion = getCompanionProfile(companionId);
    const targetLanguage = resolveLearningLanguage(user);
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
      companionPrompt: resolveCompanionPrompt(companionId, companionPrompt),
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

  const trustedCompanion = getCompanionProfile(companionId);
  const targetLanguage = resolveLearningLanguage(user);
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
    companionPrompt: resolveCompanionPrompt(companionId, companionPrompt),
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

const chatWithAi = async (req, res) => {
  const { userId } = req.params;
  const { message, companionId, companionName, companionDescription, companionPrompt, history = [] } = req.body;

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

  const trustedCompanion = getCompanionProfile(companionId);
  // Always trust language from database, never from client payload.
  const targetLanguage = resolveLearningLanguage(user);

  try {
    const reply = await requestDeepseekReply({
      message: message.trim(),
      companionId,
      companionName: trustedCompanion?.name || companionName,
      companionDescription: trustedCompanion?.description || companionDescription,
      companionPrompt: resolveCompanionPrompt(companionId, companionPrompt),
      targetLanguage,
      history,
      forVoice: false,
      user,
    });
    const skillScores = await recordSkillActivity(user, {
      source: 'chat',
      message: message.trim(),
    });
    return res.status(200).json({ reply, skillScores });
  } catch (error) {
    if (error?.code === 'DEEPSEEK_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'Layanan AI belum dikonfigurasi di backend.' });
    }
    return res.status(502).json({ message: 'Gagal mendapatkan respons AI. Coba lagi.' });
  }
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
      accessToken: grant.accessToken,
      expiresIn: grant.expiresIn,
      sttLanguage,
      endpointingMs,
      listenUrl: getEnv('DEEPGRAM_LIVE_WS_URL', 'wss://api.eu.deepgram.com/v1/listen'),
      model: getEnv('DEEPGRAM_STREAM_MODEL', 'nova-3'),
    });
  } catch (error) {
    if (error?.code === 'DEEPGRAM_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'Deepgram API belum dikonfigurasi di backend.' });
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
    const skillScores = await recordSkillActivity(user, payload);
    return res.status(200).json({ success: true, skillScores });
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Gagal memperbarui skill.',
    });
  }
};

const saveVoiceCallSummary = async (req, res) => {
  const { userId } = req.params;
  const { durationSec = 0, turns = [] } = req.body || {};

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  try {
    const skillScores = await recordVoiceCallSummary(user, {
      turns: Array.isArray(turns) ? turns : [],
      durationSec: Math.max(0, Number(durationSec) || 0),
    });
    return res.status(200).json({ success: true, skillScores });
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Gagal menyimpan ringkasan panggilan.',
    });
  }
};

module.exports = {
  getDashboard,
  saveDashboard,
  saveInterviewTeacherSetup,
  recordSkillEvent,
  saveVoiceCallSummary,
  chatWithAi,
  evaluateReadAloud,
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
