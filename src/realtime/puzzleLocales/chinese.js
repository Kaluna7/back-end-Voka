/** Prefer English Sudoword bank — Chinese pinyin truncations were breaking puzzles. */
const SUDOWORD_WORD_BANK = [];

const SYNOWORD_BANK = [
  { word: 'KUAILE', synonyms: ['GAOXIN', 'YUKUAI', 'KAIXIN', 'XINGF'] },
  { word: 'NANSHOU', synonyms: ['BEISH', 'TONGKU', 'YUYUE', 'XUANZ'] },
  { word: 'DA', synonyms: ['JUDA', 'PANGDA', 'KUODA', 'WEIDA'] },
  { word: 'XIAO', synonyms: ['WEIX', 'SUOX', 'ZUIX', 'SHAO'] },
  { word: 'KUAI', synonyms: ['XUNS', 'JISU', 'MINJ', 'GANJ'] },
  { word: 'MAN', synonyms: ['HUAN', 'CHI', 'TUNTU', 'YANCH'] },
  { word: 'RE', synonyms: ['WEN', 'NUAN', 'GONG', 'RELA'] },
  { word: 'LENG', synonyms: ['HAN', 'BING', 'LIANG', 'WEI'] },
  { word: 'PIAOLIANG', synonyms: ['MEILI', 'HAOK', 'JINGY', 'YOUY'] },
  { word: 'QIANG', synonyms: ['QIANG', 'JIAN', 'GUGAN', 'YING'] },
  { word: 'RUO', synonyms: ['XURUO', 'CUIR', 'WANR', 'WENR'] },
  { word: 'XIN', synonyms: ['XINX', 'XIAN', 'ZUIX', 'XIAND'] },
  { word: 'JIU', synonyms: ['LAO', 'GU', 'CHEN', 'JIUCH'] },
  { word: 'RONGYI', synonyms: ['JIAN', 'QING', 'MING', 'JIANY'] },
  { word: 'NANKAN', synonyms: ['KUNN', 'JIAN', 'FUZA', 'NAN'] },
];

const ANTOWORD_BANK = [
  { word: 'KUAILE', antonyms: ['NANSHOU', 'BEISH', 'TONGKU'] },
  { word: 'DA', antonyms: ['XIAO', 'WEIX', 'SUOX'] },
  { word: 'KUAI', antonyms: ['MAN', 'HUAN', 'CHI'] },
  { word: 'RE', antonyms: ['LENG', 'HAN', 'BING'] },
  { word: 'XIN', antonyms: ['JIU', 'LAO', 'GU'] },
  { word: 'RONGYI', antonyms: ['NANKAN', 'KUNN', 'FUZA'] },
  { word: 'QIANG', antonyms: ['RUO', 'XURUO', 'CUIR'] },
  { word: 'KAI', antonyms: ['GUAN', 'BI', 'FENG'] },
  { word: 'BAITIAN', antonyms: ['YE', 'WAN', 'HEI'] },
  { word: 'SHANG', antonyms: ['XIA', 'LUO', 'DIAO'] },
  { word: 'JIN', antonyms: ['CHU', 'TUI', 'LI'] },
  { word: 'AI', antonyms: ['HEN', 'ZENG', 'WU'] },
  { word: 'ZHEN', antonyms: ['JIA', 'HUANG', 'CUO'] },
  { word: 'MAN', antonyms: ['KONG', 'KONGD', 'SHAO'] },
  { word: 'GANJING', antonyms: ['ZANG', 'WU', 'HUI'] },
];

const STORY_BANK = [
  {
    title: '早晨的咖啡',
    body: '我 每早 都 喝 咖啡。 今天 我 错过 了 火车， 迟到 了。 在 车站 我 打开 笔记本， 写下 会议 要点。 下一班 火车 也 晚点， 会议 也 推迟 了。 我 轻轻 笑了， 因为 压力 没有 帮助。',
  },
  {
    title: '一封家书',
    body: '一个 下雨 的 星期二， 祖母 的 信 到了。 里面 有 照片 和 童年 汤 的 食谱。 那天 晚上 我 做了 汤， 邀请 了 邻居。 我们 聊 温暖 的 话， 我 答应 冬天 前 回家。',
  },
  {
    title: '第一次演讲',
    body: '我 从来 没有 在 公众 面前 说话， 直到 团队 选 了 我。 几周 我 在 空 房间 练习。 台上 我 的 手 在 抖， 但 第一个 笑话 让 大家 笑了。 信心 一句 一句 长 起来。 一个 学生 说 研究 感觉 很 有人情味。',
  },
];

module.exports = {
  SUDOWORD_WORD_BANK,
  SYNOWORD_BANK,
  ANTOWORD_BANK,
  STORY_BANK,
};
