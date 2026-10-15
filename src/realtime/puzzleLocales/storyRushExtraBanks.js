/**
 * Built-in Story Rush stories for languages without their own locale file, used when the
 * AI stories aren't ready yet. Non-Latin scripts carry a reading with exactly one Latin word
 * per native word (the app shows it word by word under the text).
 */

const KOREAN_STORY_BANK = [
  {
    title: '토요일 시장',
    titleRoman: 'toyoil sijang',
    body: '토요일 아침에 엄마와 시장에 갔어요. 시장에는 사람이 정말 많았어요. 우리는 사과와 배추를 샀어요. 떡집 아저씨가 따뜻한 떡을 주셨어요. 집에 와서 가족과 함께 맛있게 먹었어요. 오늘은 정말 즐거운 날이었어요.',
    bodyRoman:
      'toyoil achime eommawa sijange gasseoyo. sijangeneun sarami jeongmal manasseoyo. urineun sagwawa baechureul sasseoyo. tteokjip ajeossiga ttatteutan tteogeul jusyeosseoyo. jibe waseo gajokgwa hamkke masitge meogeosseoyo. oneureun jeongmal jeulgeoun narieosseoyo.',
  },
  {
    title: '비 오는 날',
    titleRoman: 'bi oneun nal',
    body: '오늘은 아침부터 비가 많이 왔어요. 나는 노란 우산을 들고 학교에 갔어요. 길에서 작은 고양이를 봤어요. 고양이는 비를 맞고 있었어요. 나는 우산을 고양이 위에 놓았어요. 고양이가 나를 보고 조용히 울었어요.',
    bodyRoman:
      'oneureun achimbuteo biga mani wasseoyo. naneun noran usaneul deulgo hakgyoe gasseoyo. gireseo jageun goyangireul bwasseoyo. goyangineun bireul matgo isseosseoyo. naneun usaneul goyangi wie noasseoyo. goyangiga nareul bogo joyonghi ureosseoyo.',
  },
  {
    title: '친구의 생일',
    titleRoman: 'chinguui saengil',
    body: '내일은 친구 민수의 생일이에요. 나는 오늘 빵집에 가서 케이크를 샀어요. 그리고 예쁜 카드도 썼어요. 민수는 축구를 좋아해서 작은 공도 준비했어요. 내일 친구들과 함께 생일 노래를 부를 거예요.',
    bodyRoman:
      'naeireun chingu minsuui saengirieyo. naneun oneul ppangjibe gaseo keikeureul sasseoyo. geurigo yeppeun kadeudo sseosseoyo. minsuneun chukgureul joahaeseo jageun gongdo junbihaesseoyo. naeil chingudeulgwa hamkke saengil noraereul bureul geoyeyo.',
  },
];

const ARABIC_STORY_BANK = [
  {
    title: 'صباح جميل',
    titleRoman: 'sabah jamil',
    body: 'أستيقظ كل يوم في الساعة السابعة. أشرب الحليب وآكل الخبز مع أمي. ثم أذهب إلى المدرسة مع أخي. الجو اليوم جميل والشمس دافئة. في المدرسة ألعب مع أصدقائي.',
    bodyRoman:
      "astayqiz kull yawm fi as-sa'a as-sabi'a. ashrab al-halib wa-akul al-khubz ma'a ummi. thumma adhhab ila al-madrasa ma'a akhi. al-jaww al-yawm jamil wash-shams dafi'a. fi al-madrasa al'ab ma'a asdiqa'i.",
  },
  {
    title: 'في السوق',
    titleRoman: 'fi as-suq',
    body: 'ذهبت مع أبي إلى السوق يوم الجمعة. اشترينا التفاح والموز والخبز. كان السوق مزدحما جدا. رأيت رجلا يبيع الزهور الحمراء. اشترى أبي زهرة لأمي. فرحت أمي كثيرا.',
    bodyRoman:
      "dhahabtu ma'a abi ila as-suq yawm al-jum'a. ishtarayna at-tuffah wal-mawz wal-khubz. kana as-suq muzdahiman jiddan. ra'aytu rajulan yabi' az-zuhur al-hamra'. ishtara abi zahra li-ummi. farihat ummi kathiran.",
  },
  {
    title: 'قطتي الصغيرة',
    titleRoman: 'qittati as-saghira',
    body: 'عندي قطة صغيرة اسمها لولو. لونها أبيض وعيناها زرقاوان. تحب لولو الحليب والنوم في الشمس. في المساء تلعب معي بالكرة. أنا أحب لولو كثيرا.',
    bodyRoman:
      "'indi qitta saghira ismuha lulu. lawnuha abyad wa-'aynaha zarqawan. tuhibb lulu al-halib wan-nawm fi ash-shams. fi al-masa' tal'ab ma'i bil-kura. ana uhibb lulu kathiran.",
  },
];

const HINDI_STORY_BANK = [
  {
    title: 'सुबह की सैर',
    titleRoman: 'subah ki sair',
    body: 'हर सुबह मैं अपने दादाजी के साथ पार्क जाता हूँ। हम धीरे धीरे चलते हैं। पार्क में बहुत सारे पेड़ और फूल हैं। दादाजी मुझे पुरानी कहानियाँ सुनाते हैं। फिर हम घर आकर चाय पीते हैं।',
    bodyRoman:
      'har subah main apne dadaji ke sath park jata hoon. ham dhire dhire chalte hain. park mein bahut sare ped aur phool hain. dadaji mujhe purani kahaniyan sunate hain. phir ham ghar aakar chai pite hain.',
  },
  {
    title: 'बारिश का दिन',
    titleRoman: 'barish ka din',
    body: 'आज बहुत तेज़ बारिश हो रही है। हम स्कूल नहीं गए। माँ ने गरम पकौड़े बनाए। मैं और मेरी बहन खिड़की से बारिश देख रहे हैं। बाहर बच्चे पानी में कागज़ की नाव चला रहे हैं।',
    bodyRoman:
      'aaj bahut tez barish ho rahi hai. ham school nahin gaye. maa ne garam pakode banaye. main aur meri bahan khidki se barish dekh rahe hain. bahar bachche pani mein kagaz ki naav chala rahe hain.',
  },
  {
    title: 'नया दोस्त',
    titleRoman: 'naya dost',
    body: 'हमारी कक्षा में एक नया लड़का आया। उसका नाम रवि है। वह थोड़ा शांत था। दोपहर में मैंने उसके साथ खाना खाया। अब हम दोनों अच्छे दोस्त हैं और साथ में क्रिकेट खेलते हैं।',
    bodyRoman:
      'hamari kaksha mein ek naya ladka aaya. uska naam Ravi hai. vah thoda shant tha. dopahar mein maine uske sath khana khaya. ab ham donon achchhe dost hain aur sath mein cricket khelte hain.',
  },
];

const DUTCH_STORY_BANK = [
  {
    title: 'Een dag aan zee',
    body: 'Op zaterdag gaan we met de trein naar zee. De zon schijnt en het water is koud. Mijn broer bouwt een groot zandkasteel. Ik zoek mooie schelpen op het strand. Daarna eten we samen een ijsje en lopen we langs het water.',
  },
  {
    title: 'De nieuwe fiets',
    body: 'Voor mijn verjaardag krijg ik een nieuwe fiets. Hij is rood en heeft een kleine bel. Elke ochtend fiets ik naar school. Mijn vriendin fietst met mij mee. We praten en lachen de hele weg.',
  },
  {
    title: 'Koken met opa',
    body: 'Op zondag kook ik samen met mijn opa. We maken soep met tomaten en wortels. Opa vertelt verhalen over vroeger. De keuken ruikt heerlijk. Na het eten doen we samen de afwas.',
  },
];

const ITALIAN_STORY_BANK = [
  {
    title: 'Al mercato',
    body: 'Ogni sabato vado al mercato con la nonna. Compriamo frutta fresca, pane e formaggio. Il signore della frutta ci regala sempre una mela. Poi beviamo un caffè al bar della piazza e torniamo a casa felici.',
  },
  {
    title: 'Il cane Fido',
    body: 'Il mio cane si chiama Fido. È piccolo e marrone. Ogni mattina corre nel giardino e gioca con la palla. La sera dorme vicino al mio letto. Fido è il mio migliore amico.',
  },
  {
    title: 'Una giornata di pioggia',
    body: 'Oggi piove molto e non possiamo uscire. Io e mia sorella giochiamo a carte in cucina. La mamma prepara una torta al cioccolato. Dalla finestra guardiamo le gocce sul vetro. È una giornata tranquilla.',
  },
];

module.exports = {
  Korean: KOREAN_STORY_BANK,
  Arabic: ARABIC_STORY_BANK,
  Hindi: HINDI_STORY_BANK,
  Dutch: DUTCH_STORY_BANK,
  Italian: ITALIAN_STORY_BANK,
};
