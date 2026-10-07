const { normalizeLearningLanguage } = require('../../config/learningLanguage');
const japanese = require('./japanese');
const spanish = require('./spanish');
const portuguese = require('./portuguese');
const german = require('./german');
const indonesian = require('./indonesian');
const chinese = require('./chinese');
const french = require('./french');

const normalizedLang = learningLanguage => normalizeLearningLanguage(learningLanguage);

const getSudowordWordBank = learningLanguage => {
  const lang = normalizedLang(learningLanguage);
  if (lang === 'Japanese') {
    const bank = japanese.SUDOWORD_WORD_BANK.filter(word => /^[A-Za-z]{5}$/.test(word));
    return bank.length > 0 ? bank.map(w => w.toUpperCase()) : null;
  }
  if (lang === 'Spanish') {
    const bank = spanish.SUDOWORD_WORD_BANK.filter(word => /^[A-Za-z]{5}$/.test(word));
    return bank.length > 0 ? bank.map(w => w.toUpperCase()) : null;
  }
  if (lang === 'Portuguese') {
    const bank = portuguese.SUDOWORD_WORD_BANK.filter(word => /^[A-Za-z]{5}$/.test(word));
    return bank.length > 0 ? bank.map(w => w.toUpperCase()) : null;
  }
  if (lang === 'German') {
    const bank = german.SUDOWORD_WORD_BANK.filter(word => /^[A-Za-z]{5}$/.test(word));
    return bank.length > 0 ? bank.map(w => w.toUpperCase()) : null;
  }
  if (lang === 'Indonesian') {
    const bank = indonesian.SUDOWORD_WORD_BANK.filter(word => /^[A-Za-z]{5}$/.test(word));
    return bank.length > 0 ? bank.map(w => w.toUpperCase()) : null;
  }
  if (lang === 'Chinese') {
    // Empty/truncated pinyin banks made puzzles look "scrambled"/broken — use English.
    return null;
  }
  if (lang === 'French') {
    const bank = french.SUDOWORD_WORD_BANK.filter(word => /^[A-Za-z]{5}$/.test(word));
    return bank.length > 0 ? bank.map(w => w.toUpperCase()) : null;
  }
  return null;
};

const getSynowordBank = learningLanguage => {
  const lang = normalizedLang(learningLanguage);
  if (lang === 'Japanese') {
    return japanese.SYNOWORD_BANK;
  }
  if (lang === 'Spanish') {
    return spanish.SYNOWORD_BANK;
  }
  if (lang === 'Portuguese') {
    return portuguese.SYNOWORD_BANK;
  }
  if (lang === 'German') {
    return german.SYNOWORD_BANK;
  }
  if (lang === 'Indonesian') {
    return indonesian.SYNOWORD_BANK;
  }
  if (lang === 'Chinese') {
    return chinese.SYNOWORD_BANK;
  }
  if (lang === 'French') {
    return french.SYNOWORD_BANK;
  }
  return null;
};

const getAntowordBank = learningLanguage => {
  const lang = normalizedLang(learningLanguage);
  if (lang === 'Japanese') {
    return japanese.ANTOWORD_BANK;
  }
  if (lang === 'Spanish') {
    return spanish.ANTOWORD_BANK;
  }
  if (lang === 'Portuguese') {
    return portuguese.ANTOWORD_BANK;
  }
  if (lang === 'German') {
    return german.ANTOWORD_BANK;
  }
  if (lang === 'Indonesian') {
    return indonesian.ANTOWORD_BANK;
  }
  if (lang === 'Chinese') {
    return chinese.ANTOWORD_BANK;
  }
  if (lang === 'French') {
    return french.ANTOWORD_BANK;
  }
  return null;
};

const getStoryRushBank = learningLanguage => {
  const lang = normalizedLang(learningLanguage);
  if (lang === 'Japanese') {
    return japanese.STORY_BANK;
  }
  if (lang === 'Spanish') {
    return spanish.STORY_BANK;
  }
  if (lang === 'Portuguese') {
    return portuguese.STORY_BANK;
  }
  if (lang === 'German') {
    return german.STORY_BANK;
  }
  if (lang === 'Indonesian') {
    return indonesian.STORY_BANK;
  }
  if (lang === 'Chinese') {
    return chinese.STORY_BANK;
  }
  if (lang === 'French') {
    return french.STORY_BANK;
  }
  return null;
};

module.exports = {
  getSudowordWordBank,
  getSynowordBank,
  getAntowordBank,
  getStoryRushBank,
};
