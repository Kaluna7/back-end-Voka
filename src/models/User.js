const mongoose = require('mongoose');
const { defaultDashboard, defaultSkillScores } = require('../constants/dashboardDefaults');
const { getSkillScores } = require('../services/skillScoreService');
const { generateInvitationCode } = require('../utils/invitationCode');
const { sanitizeInterviewTeacherSetup } = require('../utils/interviewTeacherSetup');

const defaultOnboarding = {
  interests: [],
  country: '',
  goal: '',
  language: '',
  level: '',
  confidence: 50,
  dailyGoal: '',
};

const lessonSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    xp: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    status: { type: String, enum: ['completed', 'current', 'locked'], default: 'locked' },
    types: { type: [String], default: [] },
  },
  { _id: false },
);

const chatMessageSchema = new mongoose.Schema(
  {
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
    },
    provider: {
      type: String,
      enum: ['email', 'google'],
      required: true,
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
    onboardingCompleted: {
      type: Boolean,
      default: false,
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
    },
    dashboard: {
      remainingTokens: { type: Number, default: 10 },
      selectedPlan: { type: String, enum: ['starter', 'pro', 'premium'], default: 'starter' },
      isPremium: { type: Boolean, default: false },
      bonusCallSeconds: { type: Number, default: 0 },
      lessons: { type: [lessonSchema], default: () => defaultDashboard().lessons },
      chats: { type: [chatSessionSchema], default: () => defaultDashboard().chats },
      learnRouteProgress: { type: Object, default: () => defaultDashboard().learnRouteProgress },
      skillScores: {
        type: {
          listening: { type: Number, default: 15 },
          speaking: { type: Number, default: 15 },
          vocabulary: { type: Number, default: 15 },
          grammar: { type: Number, default: 15 },
        },
        default: () => defaultSkillScores(),
      },
    },
  },
  { timestamps: true },
);

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
  onboarding: user.onboarding || defaultOnboarding,
  invitationCode: user.invitationCode || '',
  invitationRedeemed: Boolean(user.invitationRedeemedAt || user.referredByUserId),
  invitationRewardStatus: user.invitationRewardStatus || 'none',
  invitationRewardUnlockAt: user.invitationRewardUnlockAt || null,
});

const sanitizeDashboard = user => ({
  remainingTokens: Number(user.dashboard?.remainingTokens || 0),
  selectedPlan: user.dashboard?.selectedPlan || 'pro',
  isPremium: Boolean(user.dashboard?.isPremium),
  bonusCallSeconds: Math.max(0, Number(user.dashboard?.bonusCallSeconds || 0)),
  lessons: user.dashboard?.lessons || defaultDashboard().lessons,
  chats: user.dashboard?.chats || defaultDashboard().chats,
  learnRouteProgress: user.dashboard?.learnRouteProgress || defaultDashboard().learnRouteProgress,
  skillScores: getSkillScores(user),
  interviewTeacherSetup: sanitizeInterviewTeacherSetup(user.interviewTeacherSetup),
});

const User = mongoose.model('User', userSchema);

module.exports = {
  User,
  sanitizeUser,
  sanitizeDashboard,
  defaultOnboarding,
};
