const {
  INVITATION_REWARD_GAME_COINS,
  INVITATION_REWARD_CHAT_TOKENS,
  INVITATION_REWARD_CALL_SECONDS,
} = require('../constants/invitationRewards');

const rewardPayload = () => ({
  gameCoins: INVITATION_REWARD_GAME_COINS,
  chatTokens: INVITATION_REWARD_CHAT_TOKENS,
  callSeconds: INVITATION_REWARD_CALL_SECONDS,
});

const grantInvitationRewards = user => {
  if (!user.dashboard) {
    user.dashboard = {};
  }
  const currentTokens = Number(user.dashboard.remainingTokens || 0);
  user.dashboard.remainingTokens = currentTokens + INVITATION_REWARD_CHAT_TOKENS;
  user.dashboard.bonusCallSeconds =
    Number(user.dashboard.bonusCallSeconds || 0) + INVITATION_REWARD_CALL_SECONDS;
  user.invitationRewardStatus = 'granted';
  user.invitationRewardGrantedAt = new Date();
  return rewardPayload();
};

module.exports = {
  rewardPayload,
  grantInvitationRewards,
};
