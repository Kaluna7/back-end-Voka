const INTERVIEW_TEACHER_ID = 'leo';

const DIFFICULTY_LEVELS = new Set(['junior', 'senior', 'professional']);

const sanitizeInterviewTeacherSetup = raw => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const targetJob = typeof source.targetJob === 'string' ? source.targetJob.trim().slice(0, 120) : '';
  const difficultyLevel = DIFFICULTY_LEVELS.has(source.difficultyLevel) ? source.difficultyLevel : '';
  const updatedAt = source.updatedAt ? new Date(source.updatedAt).toISOString() : null;
  return {
    targetJob,
    difficultyLevel,
    updatedAt,
    isComplete: Boolean(targetJob && difficultyLevel),
  };
};

const isInterviewTeacherCompanionId = companionId =>
  String(companionId || '').trim().toLowerCase() === INTERVIEW_TEACHER_ID;

const buildInterviewTeacherContext = (user, companionId) => {
  if (!isInterviewTeacherCompanionId(companionId) || !user || typeof user !== 'object') {
    return '';
  }
  const setup = sanitizeInterviewTeacherSetup(user.interviewTeacherSetup);
  if (!setup.isComplete) {
    return '';
  }
  const levelLabels = {
    junior: 'Junior (entry-level, simpler questions, supportive tone)',
    senior: 'Senior (deeper experience, ownership, trade-offs)',
    professional: 'Professional (executive-level, strategy, leadership, high stakes)',
  };
  const levelHint = levelLabels[setup.difficultyLevel] || setup.difficultyLevel;
  const nameLine =
    typeof user.name === 'string' && user.name.trim()
      ? `- Candidate name: ${user.name.trim()} (use their first name naturally in conversation)\n`
      : '';
  return `Live job interview context (treat as real — never call it practice or simulation):
${nameLine}- Position they are interviewing for: ${setup.targetJob}
- Interview depth: ${levelHint}
- Opening greeting with their name and this role was already spoken — do not repeat that opener.
- You are the interviewer: listen, react like a human, ask one question at a time. Never mention "practice", "training", or "mock interview".
- Do not ask them to pick a job or difficulty again unless they want to change it.`;
};

module.exports = {
  INTERVIEW_TEACHER_ID,
  DIFFICULTY_LEVELS,
  sanitizeInterviewTeacherSetup,
  isInterviewTeacherCompanionId,
  buildInterviewTeacherContext,
};
