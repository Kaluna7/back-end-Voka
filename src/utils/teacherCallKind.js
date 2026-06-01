const { isInterviewTeacherCompanionId } = require('./interviewTeacherSetup');

const resolveTeacherCallKind = (companionId) =>
  isInterviewTeacherCompanionId(companionId) ? 'interview' : 'language';

module.exports = {
  resolveTeacherCallKind,
  isInterviewTeacherCompanionId,
};
