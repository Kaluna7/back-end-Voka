/** Romaji 5-letter words for grid games (Sudoword). */
const SUDOWORD_WORD_BANK = [
  'RINGO',
  'SUSHI',
  'RAMEN',
  'GAKKO',
  'GOHAN',
  'SENSE',
  'KOUEN',
  'NATSU',
  'GINZA',
  'OSAKA',
  'KYOTO',
  'MANGA',
  'ANIME',
  'INARI',
  'TOKYO',
  'KARAO',
  'SAKUR',
  'MATCH',
  'TENKI',
  'DENWA',
  'HOTEL',
  'KAZOK',
  'BUDOU',
  'YAKIM',
  'NORIM',
  'TAIKO',
  'SHIRO',
  'KURAI',
  'AKARI',
  'HOSHI',
  'TSUKI',
];

/** Synonym prompts in romaji (A–Z normalized on submit). */
const SYNOWORD_BANK = [
  { word: 'TAKAI', synonyms: ['KOUKA', 'TAKKA', 'JUURYOU', 'NEDAN'] },
  { word: 'HIKUI', synonyms: ['YASUI', 'TEINEI', 'SUKUNA', 'CHIISA'] },
  { word: 'OOKII', synonyms: ['BIG', 'LARGE', 'HUGE'] },
  { word: 'HAYAI', synonyms: ['SUISOKU', 'KOUSOKU', 'ISOGU'] },
  { word: 'OSOI', synonyms: ['YUKKURI', 'JUUTAI', 'OMOI'] },
  { word: 'ATARASHII', synonyms: ['SHIN', 'SAISHIN', 'MODERN'] },
  { word: 'FURUI', synonyms: ['KO', 'MUKASHI', 'DATED'] },
  { word: 'KIREI', synonyms: ['UTSUKUSHII', 'SEIKETSU', 'PRETTY'] },
  { word: 'SHIZUKA', synonyms: ['CALM', 'PEACE', 'MUTE'] },
  { word: 'ISOGASHII', synonyms: ['BUSY', 'KONZATSU', 'HAYAI'] },
  { word: 'TANOSHII', synonyms: ['URESHII', 'YOROKO', 'HAPPY'] },
  { word: 'KANASHII', synonyms: ['SAD', 'HIKARI', 'MUNASHII'] },
  { word: 'TSUYOI', synonyms: ['STRONG', 'POWER', 'ROBUST'] },
  { word: 'YOWAI', synonyms: ['WEAK', 'FRAIL', 'TENDER'] },
  { word: 'ATATAKAI', synonyms: ['WARM', 'NUKU', 'DANBO'] },
  { word: 'TSUMETAI', synonyms: ['COLD', 'CHILL', 'FRIGID'] },
  { word: 'OISHII', synonyms: ['TASTY', 'UMAMI', 'GOOD'] },
  { word: 'MUZUKASHII', synonyms: ['HARD', 'DIFFICULT', 'TOUGH'] },
  { word: 'KANTAN', synonyms: ['EASY', 'SIMPLE', 'LIGHT'] },
  { word: 'SHINPAI', synonyms: ['WORRY', 'ANXIOUS', 'CARE'] },
];

const ANTOWORD_BANK = [
  { word: 'TAKAI', antonyms: ['YASUI', 'HIKUI', 'TEINEI'] },
  { word: 'HAYAI', antonyms: ['OSOI', 'YUKKURI', 'JUUTAI'] },
  { word: 'ATARASHII', antonyms: ['FURUI', 'KO', 'OLD'] },
  { word: 'TANOSHII', antonyms: ['KANASHII', 'SAD', 'HIKARI'] },
  { word: 'TSUYOI', antonyms: ['YOWAI', 'WEAK', 'FRAIL'] },
  { word: 'ATATAKAI', antonyms: ['TSUMETAI', 'COLD', 'CHILL'] },
  { word: 'OISHII', antonyms: ['MAZUI', 'BAD', 'AWFUL'] },
  { word: 'KIREI', antonyms: ['KITANAI', 'DIRTY', 'MESSY'] },
  { word: 'SHIZUKA', antonyms: ['URUSAI', 'LOUD', 'NOISY'] },
  { word: 'KANTAN', antonyms: ['MUZUKASHII', 'HARD', 'TOUGH'] },
  { word: 'HOT', antonyms: ['COLD', 'TSUMETAI', 'CHILL'] },
  { word: 'BIG', antonyms: ['SMALL', 'CHIISA', 'TINY'] },
  { word: 'BEGIN', antonyms: ['END', 'OWARI', 'FINISH'] },
  { word: 'LOVE', antonyms: ['HATE', 'KIRAI', 'DETEST'] },
  { word: 'DAY', antonyms: ['NIGHT', 'YORU', 'DARK'] },
];

const STORY_BANK = [
  {
    title: '朝のコーヒー',
    body: '私は 毎朝 コーヒーを 飲みます。 今日は 電車に 乗り遅れました。 駅で ノートを 開き、 会議の 要点を 書きました。 次の 電車で 会社に 着くと、 会議は 三十分 遅れていました。 私は 静かに 笑い、 慌てた 時間を 思い出しました。',
  },
  {
    title: '雨の日の手紙',
    body: '雨の 火曜日、 祖母の 字で 書かれた 手紙が 届きました。 中には 古い 写真と、 子どもの 頃の 味の スープの レシピが ありました。 私は その夜 スープを 作り、 近所の 人を 招きました。 温かい 言葉について 話し、 冬が 終わる 前に 故郷へ 帰ると 約束しました。',
  },
  {
    title: '初めての発表',
    body: '私は 人前で 話すのが 苦手でした。 それでも チームに 選ばれ、 何週間も 空の 部屋で 練習しました。 舞台では 手が 震えましたが、 最初の 冗談で 笑いが 起きました。 自信は すぐには 来ませんでした。 一つ 一つの 文と ともに 育ちました。 研究が 人間的に 感じられると 言ってくれた 学生がいて、 勇気は 借りる ものだと 分かりました。',
  },
];

module.exports = {
  SUDOWORD_WORD_BANK,
  SYNOWORD_BANK,
  ANTOWORD_BANK,
  STORY_BANK,
};
