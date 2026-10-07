const mongoose = require('mongoose');
const { defaultDashboard, defaultSkillScores } = require('../constants/dashboardDefaults');
const { getSkillScores, getSkillBreakdown } = require('../services/skillScoreService');
const { generateInvitationCode } = require('../utils/invitationCode');
const { sanitizeInterviewTeacherSetup } = require('../utils/interviewTeacherSetup');
const { sanitizeCompanionBondStates } = require('../utils/companionBondState');
const { mergeChatArchiveState, sanitizeChatSessions } = require('../utils/chatSessionState');
const { estimateVoiceTokensPerMinute, WELCOME_VOICE_TOKENS } = require('../config/voicePlans');

const defaultOnboarding = {
  interests: [],
  country: '',
  goal: '',
  language: '',
  level: '',
  confidence: 50,
  dailyGoal: '',
  gender: '',
};

const chatMessageSchema = new mongoose.Schema(
  {
    id: { type: String, default: '' },
    role: { type: String, enum: ['ai', 'user'], required: true },
    text: { type: String, required: true },
  },
  { _id: false },
);

const chatSessionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: '' },
    preview: { type: String, default: '' },
    time: { type: String, default: '' },
    companion: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      type: { type: String, enum: ['teacher', 'character'], required: true },
      image: { type: String, default: '' },
      description: { type: String, default: '' },
    },
    unread: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    messages: { type: [chatMessageSchema], default: [] },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      default: null,
      // scrypt hash (see security/passwords.js). Never loaded unless asked for with +password.
      select: false,
    },
    /** Bumped to revoke every issued access token (password reset, log out everywhere). */
    authVersion: {
      type: Number,
      default: 0,
    },
    provider: {
      type: String,
      enum: ['email', 'google'],
      required: true,
    },
    providerUid: {
      type: String,
      default: '',
    },
    ownerId: {
      type: String,
      default: '',
      index: true,
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    accountSettings: {
      emailNotification: { type: Boolean, default: true },
      dailyReminder: { type: Boolean, default: true },
      privateProfile: { type: Boolean, default: false },
    },
    invitationCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    referredByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    invitationRedeemedAt: {
      type: Date,
      default: null,
    },
    invitationRewardStatus: {
      type: String,
      enum: ['none', 'pending', 'granted'],
      default: 'none',
    },
    invitationRewardUnlockAt: {
      type: Date,
      default: null,
    },
    invitationRewardGrantedAt: {
      type: Date,
      default: null,
    },
    /** Game leaderboard: XP this week (reset when weekKey changes) and all-time. */
    gameStats: {
      weekKey: { type: String, default: '' },
      weeklyXp: { type: Number, default: 0 },
      totalXp: { type: Number, default: 0 },
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    appLanguage: {
      type: String,
      default: '',
      trim: true,
    },
    interviewTeacherSetup: {
      targetJob: { type: String, default: '', maxlength: 120 },
      difficultyLevel: {
        type: String,
        enum: ['', 'junior', 'senior', 'professional'],
        default: '',
      },
      updatedAt: { type: Date, default: null },
    },
    onboarding: {
      interests: {
        type: [String],
        default: [],
      },
      country: {
        type: String,
        default: '',
      },
      goal: {
        type: String,
        default: '',
      },
      language: {
        type: String,
        default: '',
      },
      level: {
        type: String,
        default: '',
      },
      confidence: {
        type: Number,
        default: 50,
      },
      dailyGoal: {
        type: String,
        default: '',
      },
      /** 'male' | 'female' | 'other' | '' — lets characters/teachers address the user correctly. */
      gender: {
        type: String,
        enum: ['male', 'female', 'other', ''],
        default: '',
      },
    },
    dashboard: {
      remainingTokens: { type: Number, default: 10 },
      selectedPlan: { type: String, enum: ['starter', 'pro', 'premium'], default: 'starter' },
      isPremium: { type: Boolean, default: false },
      bonusCallSeconds: { type: Number, default: 0 },
      /** Server-side call quota (STT + TTS cost based). See config/voicePlans.js. */
      voiceTokens: { type: Number, default: 0 },
      voicePeriodEndsAt: { type: Date, default: null },
      /** User cancelled: plan stays active until voicePeriodEndsAt, then reverts to free. */
      subscriptionCancelAtPeriodEnd: { type: Boolean, default: false },
      /** Nami's welcome chat was added once; never re-add after the user deletes it. */
      welcomeTeacherSeeded: { type: Boolean, default: false },
      /** 'google_play' once a Play purchase is verified; '' for dev/unverified grants. */
      billingProvider: { type: String, default: '' },
      googlePlayPurchaseToken: { type: String, default: '', index: true },
      googlePlayProductId: { type: String, default: '' },
      googlePlayOrderId: { type: String, default: '' },
      chats: { type: [chatSessionSchema], default: () => defaultDashboard().chats },
      skillScores: {
        type: {
          listening: { type: Number, default: 15 },
          speaking: { type: Number, default: 15 },
          vocabulary: { type: Number, default: 15 },
          grammar: { type: Number, default: 15 },
        },
        default: () => defaultSkillScores(),
      },
      skillProgress: { type: mongoose.Schema.Types.Mixed, default: undefined },
      savedCharacterIds: { type: [String], default: [] },
      archivedChatListIds: { type: [String], default: [] },
      companionBondStates: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
  },
  { timestamps: true },
);

userSchema.index({ 'gameStats.weekKey': 1, 'gameStats.weeklyXp': -1 });

// New accounts start with ~5 minutes of teacher calls.
userSchema.pre('save', function grantWelcomeVoiceTokens() {
  if (!this.isNew || WELCOME_VOICE_TOKENS <= 0) {
    return;
  }
  if (!this.dashboard) {
    this.dashboard = {};
  }
  this.dashboard.voiceTokens = Math.max(0, Number(this.dashboard.voiceTokens || 0)) + WELCOME_VOICE_TOKENS;
});

userSchema.pre('save', async function assignInvitationCode() {
  if (this.invitationCode || !this.isNew) {
    return;
  }
  const UserModel = this.constructor;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateInvitationCode();
    const taken = await UserModel.findOne({ invitationCode: candidate }).select('_id').lean();
    if (!taken) {
      this.invitationCode = candidate;
      return;
    }
  }
  throw new Error('Gagal membuat kode undangan untuk user baru.');
});

const sanitizeUser = user => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  provider: user.provider,
  avatarUrl: user.avatarUrl || '',
  accountSettings: {
    emailNotification: user.accountSettings?.emailNotification ?? true,
    dailyReminder: user.accountSettings?.dailyReminder ?? true,
    privateProfile: user.accountSettings?.privateProfile ?? false,
  },
  onboardingCompleted: Boolean(user.onboardingCompleted),
  appLanguage: user.appLanguage || '',
  onboarding: user.onboarding || defaultOnboarding,
  invitationCode: user.invitationCode || '',
  invitationRedeemed: Boolean(user.invitationRedeemedAt || user.referredByUserId),
  invitationRewardStatus: user.invitationRewardStatus || 'none',
  invitationRewardUnlockAt: user.invitationRewardUnlockAt || null,
});

const buildOwnerId = ({ provider, email, providerUid }) => {
  const uid = typeof providerUid === 'string' ? providerUid.trim() : '';
  if (provider === 'google' && uid) {
    return `google:${uid}`;
  }
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (normalizedEmail) {
    return `email:${normalizedEmail}`;
  }
  return '';
};

const sanitizeDashboard = user => {
  const mergedArchive = mergeChatArchiveState(
    user.dashboard?.chats,
    user.dashboard?.archivedChatListIds,
  );
  return {
    remainingTokens: Number(user.dashboard?.remainingTokens || 0),
    selectedPlan: user.dashboard?.selectedPlan || 'pro',
    isPremium: Boolean(user.dashboard?.isPremium),
    bonusCallSeconds: Math.max(0, Number(user.dashboard?.bonusCallSeconds || 0)),
    voiceTokens: Math.max(0, Math.floor(Number(user.dashboard?.voiceTokens || 0))),
    voicePeriodEndsAt: user.dashboard?.voicePeriodEndsAt || null,
    subscriptionCancelAtPeriodEnd: Boolean(user.dashboard?.subscriptionCancelAtPeriodEnd),
    voiceTokensPerMinute: estimateVoiceTokensPerMinute(),
    chats: mergedArchive.chats,
    skillScores: getSkillScores(user),
    skillBreakdown: getSkillBreakdown(user),
    interviewTeacherSetup: sanitizeInterviewTeacherSetup(user.interviewTeacherSetup),
    savedCharacterIds: Array.isArray(user.dashboard?.savedCharacterIds)
      ? user.dashboard.savedCharacterIds.map(String)
      : [],
    companionBondStates: sanitizeCompanionBondStates(
      user.dashboard?.companionBondStates && typeof user.dashboard.companionBondStates === 'object'
        ? user.dashboard.companionBondStates
        : {},
    ),
    archivedChatListIds: mergedArchive.archivedChatListIds,
  };
};

const User = mongoose.model('User', userSchema);

module.exports = {
  User,
  sanitizeUser,
  sanitizeDashboard,
  defaultOnboarding,
  buildOwnerId,
};
