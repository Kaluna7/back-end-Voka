const { normalizeLearningLanguage } = require('../config/learningLanguage');

const MIN_LATIN_OFF_TARGET = 4;
const MIN_CJK_OFF_TARGET = 2;
const DOMINANT_SCRIPT_RATIO = 0.55;
const MIN_WORD_TOKENS = 2;
const ENGLISH_DOMINANCE_RATIO = 0.4;
const OTHER_LANG_DOMINANCE_RATIO = 0.35;

const ENGLISH_MARKERS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'it',
  'my',
  'your',
  'what',
  'how',
  'why',
  'when',
  'where',
  'hello',
  'hi',
  'yes',
  'no',
  'please',
  'thank',
  'thanks',
  'sorry',
  'know',
  'think',
  'want',
  'need',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'can',
  'could',
  'would',
  'should',
  'will',
  'am',
  'be',
  'been',
  'being',
  'this',
  'that',
  'these',
  'those',
  'and',
  'or',
  'but',
  'not',
  'dont',
  "don't",
  'im',
  "i'm",
  'its',
  "it's",
  'okay',
  'ok',
  'english',
  'speak',
  'understand',
  'about',
  'because',
  'really',
  'very',
  'just',
  'like',
  'get',
  'got',
  'going',
  'today',
  'tomorrow',
  'yesterday',
]);

const LANGUAGE_MARKERS = {
  Spanish: new Set([
    'hola',
    'gracias',
    'por',
    'que',
    'qué',
    'como',
    'cómo',
    'está',
    'esta',
    'estoy',
    'quiero',
    'tengo',
    'español',
    'espanol',
    'sí',
    'si',
    'yo',
    'tú',
    'tu',
    'él',
    'ella',
    'nosotros',
    'pero',
    'muy',
    'bien',
    'mal',
    'hablar',
    'entiendo',
    'favor',
    'señor',
    'señora',
    'día',
    'dia',
  ]),
  Portuguese: new Set([
    'olá',
    'ola',
    'obrigado',
    'obrigada',
    'por',
    'que',
    'como',
    'está',
    'esta',
    'estou',
    'quero',
    'tenho',
    'português',
    'portugues',
    'sim',
    'não',
    'nao',
    'eu',
    'você',
    'voce',
    'ele',
    'ela',
    'nós',
    'nos',
    'muito',
    'bem',
    'mal',
    'falar',
    'entendo',
    'favor',
    'dia',
  ]),
  French: new Set([
    'bonjour',
    'salut',
    'merci',
    'oui',
    'non',
    'je',
    'tu',
    'vous',
    'il',
    'elle',
    'nous',
    'ils',
    'elles',
    'est',
    'suis',
    'sommes',
    'être',
    'etre',
    'avoir',
    'veux',
    'voudrais',
    'parler',
    'français',
    'francais',
    'comment',
    'pourquoi',
    'quoi',
    'très',
    'tres',
    'bien',
    'mal',
    'sil',
    'plait',
    'plait',
    'aujourd',
    'aujourdhui',
  ]),
  German: new Set([
    'hallo',
    'danke',
    'bitte',
    'ja',
    'nein',
    'ich',
    'du',
    'sie',
    'er',
    'sie',
    'wir',
    'ihr',
    'ist',
    'sind',
    'bin',
    'habe',
    'haben',
    'möchte',
    'mochte',
    'sprechen',
    'deutsch',
    'german',
    'wie',
    'was',
    'warum',
    'wann',
    'wo',
    'sehr',
    'gut',
    'schlecht',
    'und',
    'oder',
    'aber',
    'nicht',
    'heute',
    'morgen',
  ]),
  Dutch: new Set([
    'hallo',
    'dank',
    'dankje',
    'alstublieft',
    'alsjeblieft',
    'niet',
    'ja',
    'nee',
    'ik',
    'jij',
    'je',
    'hij',
    'zij',
    'wij',
    'zijn',
    'hebben',
    'wil',
    'spreken',
    'nederlands',
    'goed',
    'slecht',
    'hoe',
    'wat',
    'waarom',
    'wanneer',
    'waar',
    'vandaag',
    'morgen',
    'begrijp',
  ]),
  Italian: new Set([
    'ciao',
    'grazie',
    'prego',
    'sì',
    'si',
    'no',
    'io',
    'tu',
    'lui',
    'lei',
    'noi',
    'voi',
    'sono',
    'ho',
    'hai',
    'essere',
    'parlare',
    'capisco',
    'italiano',
    'bene',
    'male',
    'come',
    'cosa',
    'perché',
    'perche',
    'quando',
    'dove',
    'molto',
    'oggi',
    'domani',
    'favore',
  ]),
  Indonesian: new Set([
    'halo',
    'hai',
    'terima',
    'kasih',
    'maaf',
    'tolong',
    'mohon',
    'saya',
    'aku',
    'kamu',
    'anda',
    'dia',
    'kami',
    'kita',
    'mereka',
    'tidak',
    'bukan',
    'ya',
    'apa',
    'bagaimana',
    'kenapa',
    'kapan',
    'dimana',
    'di',
    'ke',
    'dari',
    'untuk',
    'dengan',
    'ini',
    'itu',
    'dan',
    'atau',
    'tapi',
    'sudah',
    'belum',
    'juga',
    'sangat',
    'bisa',
    'ingin',
    'mau',
    'bahasa',
    'indonesia',
    'bicara',
    'ngerti',
    'mengerti',
    'baik',
    'buruk',
    'hari',
  ]),
  Japanese: new Set([
    'こんにちは',
    'ありがとう',
    'すみません',
    'はい',
    'いいえ',
    '日本語',
    'です',
    'ます',
    'した',
    'する',
    'ない',
    'わかり',
  ]),
  Korean: new Set([
    '안녕',
    '감사',
    '죄송',
    '네',
    '아니',
    '한국어',
    '입니다',
    '해요',
    '했어',
    '하고',
  ]),
  Chinese: new Set([
    '你好',
    '谢谢',
    '对不起',
    '是的',
    '不是',
    '中文',
    '汉语',
    '普通话',
    '我',
    '你',
    '他',
    '她',
    '我们',
    '他们',
    '的',
    '了',
    '吗',
    '呢',
  ]),
};

const CJK_SCRIPT_RE = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/;
const ARABIC_SCRIPT_RE = /[\u0600-\u06ff]/;
const CYRILLIC_SCRIPT_RE = /[\u0400-\u04ff]/;
const THAI_SCRIPT_RE = /[\u0e00-\u0e7f]/;
const DEVANAGARI_SCRIPT_RE = /[\u0900-\u097f]/;

const countScriptStats = text => {
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const hiragana = (text.match(/[\u3040-\u309f]/g) || []).length;
  const katakana = (text.match(/[\u30a0-\u30ff]/g) || []).length;
  const hangul = (text.match(/[\uac00-\ud7af]/g) || []).length;
  const han = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const cjk = hiragana + katakana + hangul + han;
  const arabic = (text.match(ARABIC_SCRIPT_RE) || []).length;
  const cyrillic = (text.match(CYRILLIC_SCRIPT_RE) || []).length;
  const thai = (text.match(THAI_SCRIPT_RE) || []).length;
  const devanagari = (text.match(DEVANAGARI_SCRIPT_RE) || []).length;
  const nonLatin =
    cjk + arabic + cyrillic + thai + devanagari;
  return { latin, hiragana, katakana, hangul, han, cjk, arabic, cyrillic, thai, devanagari, nonLatin };
};

const tokenize = text =>
  String(text)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[''`´]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean);

const countMarkerHits = (tokens, markerSet) => {
  let hits = 0;
  for (const token of tokens) {
    if (markerSet.has(token)) {
      hits += 1;
    }
  }
  return hits;
};

const isScriptOffTarget = (lang, stats) => {
  const { latin, hangul, han, cjk, nonLatin, arabic } = stats;
  const contentLen = latin + stats.cjk;

  switch (lang) {
    case 'Japanese': {
      if (latin >= MIN_LATIN_OFF_TARGET && cjk === 0) {
        return true;
      }
      if (latin > 0 && cjk > 0 && latin / contentLen >= DOMINANT_SCRIPT_RATIO) {
        return true;
      }
      if (arabic + stats.cyrillic + stats.thai >= MIN_CJK_OFF_TARGET && cjk === 0) {
        return true;
      }
      return false;
    }
    case 'Korean': {
      if (latin >= MIN_LATIN_OFF_TARGET && hangul === 0 && han === 0) {
        return true;
      }
      if (latin > 0 && hangul + han > 0 && latin / contentLen >= DOMINANT_SCRIPT_RATIO) {
        return true;
      }
      if (nonLatin - hangul - han >= MIN_CJK_OFF_TARGET && hangul === 0) {
        return true;
      }
      return false;
    }
    case 'Chinese': {
      if (latin >= MIN_LATIN_OFF_TARGET && han === 0 && hangul === 0) {
        return true;
      }
      if (latin > 0 && han > 0 && latin / (latin + han) >= DOMINANT_SCRIPT_RATIO) {
        return true;
      }
      if (nonLatin - han >= MIN_CJK_OFF_TARGET && han === 0) {
        return true;
      }
      return false;
    }
    case 'English': {
      if (nonLatin >= MIN_CJK_OFF_TARGET && latin < 3) {
        return true;
      }
      if (nonLatin > 0 && latin > 0 && nonLatin / (latin + nonLatin) >= DOMINANT_SCRIPT_RATIO) {
        return true;
      }
      return false;
    }
    default: {
      if (nonLatin >= MIN_CJK_OFF_TARGET && latin < MIN_LATIN_OFF_TARGET) {
        return true;
      }
      if (nonLatin > 0 && latin > 0 && nonLatin / (latin + nonLatin) >= DOMINANT_SCRIPT_RATIO) {
        return true;
      }
      return false;
    }
  }
};

/**
 * Latin / mixed transcripts: score English + each featured language's marker words.
 */
const isWordMixOffTarget = (lang, clean) => {
  const tokens = tokenize(clean);
  if (tokens.length < MIN_WORD_TOKENS) {
    return false;
  }

  const targetMarkers = LANGUAGE_MARKERS[lang];
  const targetHits = targetMarkers ? countMarkerHits(tokens, targetMarkers) : 0;
  const englishHits = countMarkerHits(tokens, ENGLISH_MARKERS);

  if (lang === 'English') {
    let bestOther = 0;
    for (const [otherLang, markers] of Object.entries(LANGUAGE_MARKERS)) {
      if (otherLang === 'English') {
        continue;
      }
      const hits = countMarkerHits(tokens, markers);
      if (hits > bestOther) {
        bestOther = hits;
      }
    }
    if (bestOther >= 2 && bestOther > englishHits) {
      return true;
    }
    if (bestOther >= 1 && englishHits === 0 && tokens.length <= 4) {
      return true;
    }
    return false;
  }

  if (
    englishHits >= 2 &&
    englishHits >= tokens.length * ENGLISH_DOMINANCE_RATIO &&
    englishHits > targetHits
  ) {
    return true;
  }

  for (const [otherLang, markers] of Object.entries(LANGUAGE_MARKERS)) {
    if (otherLang === lang) {
      continue;
    }
    const hits = countMarkerHits(tokens, markers);
    if (
      hits >= 2 &&
      hits >= tokens.length * OTHER_LANG_DOMINANCE_RATIO &&
      hits > targetHits &&
      hits >= englishHits
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Heuristic: transcript is outside the user's learning language.
 * Skips LLM so teacher can reply instantly in the target language.
 */
const isOffTargetLanguageTranscript = (transcript, targetLanguage) => {
  const clean = String(transcript || '').trim();
  if (clean.length < 2) {
    return false;
  }

  const lang = normalizeLearningLanguage(targetLanguage);
  const stats = countScriptStats(clean);

  if (isScriptOffTarget(lang, stats)) {
    return true;
  }

  if (CJK_SCRIPT_RE.test(clean) && !['Japanese', 'Korean', 'Chinese'].includes(lang)) {
    const cjkOnly = stats.cjk >= MIN_CJK_OFF_TARGET && stats.latin < MIN_LATIN_OFF_TARGET;
    if (cjkOnly) {
      return true;
    }
  }

  return isWordMixOffTarget(lang, clean);
};

const OFF_TARGET_REPLIES = {
  Japanese:
    'すみません、よく聞き取れませんでした。日本語で話してもらえますか。そうすれば、お手伝いできます。',
  Korean:
    '죄송해요, 잘 이해하지 못했어요. 한국어로 말씀해 주시면 도와드릴 수 있어요.',
  Chinese: '抱歉，我没有听懂。请用中文说话，这样我才能帮助你。',
  English:
    "I didn't understand what you said. Please try speaking in English so I can help you.",
  Spanish:
    'No entendí lo que dijiste. Por favor, habla en español para que pueda ayudarte.',
  Portuguese:
    'Não entendi o que você disse. Por favor, fale em português para que eu possa ajudar.',
  French:
    "Je n'ai pas compris ce que vous avez dit. Parlez en français, s'il vous plaît, pour que je puisse vous aider.",
  German:
    'Ich habe nicht verstanden, was du gesagt hast. Bitte sprich auf Deutsch, damit ich dir helfen kann.',
  Dutch:
    'Ik begreep niet wat je zei. Spreek alsjeblieft Nederlands, zodat ik je kan helpen.',
  Italian:
    'Non ho capito cosa hai detto. Per favore parla in italiano così posso aiutarti.',
  Indonesian:
    'Maaf, saya tidak mengerti apa yang Anda katakan. Coba gunakan bahasa Indonesia agar saya bisa membantu.',
};

const buildOffTargetLanguageReply = targetLanguage => {
  const lang = normalizeLearningLanguage(targetLanguage);
  return OFF_TARGET_REPLIES[lang] || OFF_TARGET_REPLIES.English;
};

const isStrictVoiceLanguageEnabled = user =>
  user?.accountSettings?.strictVoiceLanguage !== false;

module.exports = {
  isOffTargetLanguageTranscript,
  buildOffTargetLanguageReply,
  isStrictVoiceLanguageEnabled,
};
