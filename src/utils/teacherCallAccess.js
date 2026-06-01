const isPremiumDashboardUser = user => Boolean(user?.dashboard?.isPremium);

/** Buang topik chat dari payload jika user bukan Premium; riwayat in-call tetap dipakai. */
const sanitizeTeacherCallPayload = (payload = {}, user) => {
  const history = Array.isArray(payload.history) ? payload.history : [];
  if (isPremiumDashboardUser(user)) {
    return {
      history,
      callChatTopic:
        typeof payload.callChatTopic === 'string' && payload.callChatTopic.trim()
          ? payload.callChatTopic.trim()
          : null,
    };
  }
  return {
    history,
    callChatTopic: null,
  };
};

module.exports = {
  isPremiumDashboardUser,
  sanitizeTeacherCallPayload,
};
