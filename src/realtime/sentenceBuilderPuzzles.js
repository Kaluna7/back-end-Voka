const { randomBotName } = require('./sudowordPuzzles');

const SENTENCE_BANK = [
  "I have been working on this project since Monday",
  "She would have called you if she had known",
  "The report must be submitted before the deadline",
  "We are looking forward to meeting the new team",
  "He suggested that we leave early to avoid traffic",
  "They had already finished dinner when we arrived",
  "I go to school every weekday morning",
  "The manager asked whether we could finish today",
  "Neither the plan nor the backup option seemed viable",
  "Despite the rain the concert continued as scheduled",
  "She has rarely traveled abroad without her family",
  "The documents were reviewed by an external auditor",
  "If it rains tomorrow we will cancel the picnic",
  "He speaks English fluently but writes with difficulty",
  "We ought to have informed them about the change",
  "The committee will announce the results next week",
  "I would rather stay home than go out tonight",
  "They have been negotiating the contract for months",
  "The software update caused several unexpected errors",
  "She insisted on paying for everyone at the table",
  "Hardly had we sat down when the phone rang",
  "The museum is closed on Mondays and public holidays",
  "He denied having seen anyone near the building",
  "We need to figure out a better long term solution",
  "The lecture was far more engaging than I expected",
  "She could not remember where she had parked",
  "The train was delayed due to signal problems",
  "I have never tasted anything quite like this dish",
  "They promised to send the invoice by Friday",
  "The proposal was rejected for lack of detail",
  "He tends to overthink even the simplest decisions",
  "We ran out of time before finishing the presentation",
  "The author claims that the theory is widely misunderstood",
  "She graduated from university with honors last spring",
  "The meeting has been postponed until further notice",
  "I would have helped if you had asked me earlier",
  "They are accustomed to working under tight deadlines",
  "The evidence does not support the initial hypothesis",
  "He apologized for not replying to your message sooner",
  "We should have left earlier to beat the traffic",
  "The company is planning to expand into Asian markets",
  "She speaks three languages in addition to her native one",
  "The project turned out to be more complex than expected",
  "I am not used to waking up this early on weekends",
  "They accused him of leaking confidential information",
  "The policy applies to all employees without exception",
  "He warned us not to underestimate the competition",
  "We have run into several technical issues this week",
  "The book was translated into more than twenty languages",
  "She looked as though she had not slept at all",
  "The results were disappointing despite our best efforts",
  "I cannot afford to miss another day of work",
  "They agreed to meet again after reviewing the data",
  "The restaurant was fully booked when we called",
  "He has a reputation for being difficult to work with",
  "We are running low on supplies and need to reorder",
  "The interview went better than I had anticipated",
  "She refused to comment on the ongoing investigation",
  "The flight was cancelled because of severe weather",
  "I had no idea that the store closed so early",
  "They invested heavily in renewable energy last year",
  "The teacher encouraged students to ask more questions",
  "He managed to fix the problem without outside help",
  "We will proceed once we receive written approval",
  "The speech was interrupted by a sudden power outage",
  "She is responsible for coordinating the entire event",
  "The contract expires at the end of this month",
  "I regret not having studied harder for the exam",
  "They were surprised by how quickly things changed",
  "The road was blocked off after the accident",
  "He pretended not to notice the awkward silence",
  "We are committed to reducing our carbon footprint",
  "The package should arrive within three business days",
  "She avoided answering the question directly",
  "The team celebrated after winning the championship",
  "I have been trying to reach you all morning",
  "They filed a complaint against the service provider",
  "The experiment failed because of contaminated samples",
  "He offered to drive us to the airport tomorrow",
  "We had better leave now or we will be late",
  "The article discusses the impact of social media",
  "She was promoted to senior manager last quarter",
  "The hotel overlooks the harbor from every room",
  "I do not agree with the conclusion they reached",
  "They pulled out of the deal at the last minute",
  "The instructions were unclear and poorly translated",
  "He confessed that he had made a serious mistake",
  "We are hoping for a positive response by Monday",
  "The storm damaged several homes along the coast",
  "She specializes in treating rare genetic disorders",
  "The board voted unanimously to approve the merger",
  "I have got to finish this report by tonight",
  "They blamed the delay on a supplier error",
  "The performance exceeded all of our expectations",
  "He is unlikely to change his mind at this point",
  "We came across an interesting article yesterday",
  "The rules prohibit smoking anywhere on the premises",
  "She handed in her resignation letter this morning",
  "The software is compatible with most operating systems",
  "I was under the impression that the meeting was today",
  "They carried on despite facing strong opposition",
  "The witness described exactly what had happened",
  "He is qualified to perform the surgery himself",
  "We need a strategy that works in every region",
  "The price includes tax and service charges",
  "She burst into tears when she heard the news",
  "The campaign aims to raise awareness about mental health",
  "I have run out of patience with this situation",
  "They set up a committee to investigate the matter",
  "The bridge connects the two sides of the river",
  "He reminded me to bring the signed documents",
  "We are short staffed because two people called in sick",
  "The novel was adapted into a successful film",
  "She takes pride in doing her work thoroughly",
  "The issue stems from a misunderstanding months ago",
  "I would appreciate it if you could reply soon",
  "They backed down after public pressure mounted",
  "The laboratory is equipped with state of the art tools",
  "He struggled to keep up with the fast paced lecture",
  "We intend to launch the product next quarter",
  "The judge ruled in favor of the plaintiff",
  "She confided in her friend about the problem",
  "The economy has recovered faster than analysts predicted",
  "I am looking for someone who speaks Japanese fluently",
  "They turned down our offer without explanation",
  "The hallway was dimly lit and eerily quiet",
  "He owes his success to years of disciplined practice",
  "We must ensure that everyone follows safety protocols",
  "The charity relies on donations from private individuals",
  "She caught up with the rest of the group later",
  "The printer jammed right before the presentation started",
  "I have had enough of these constant interruptions",
  "They emphasized the importance of teamwork and trust",
  "The treaty was signed by both nations in Geneva",
  "He shrugged and said he did not know either",
  "We are dealing with an unprecedented level of demand",
  "The recipe calls for fresh herbs and olive oil",
  "She narrowed down the list to three finalists",
  "The outage affected thousands of customers nationwide",
  "I am inclined to believe what she told us",
  "They postponed the launch because of quality concerns",
  "The professor challenged us to think more critically",
  "He was fined for driving without a valid license",
  "We should take into account their cultural background",
  "The stadium was packed with enthusiastic fans",
  "She made an effort to speak more clearly",
  "The negotiations broke down over a single clause",
  "I have been assigned to lead the new initiative",
  "They welcomed the guests with warm hospitality",
  "The path winds through dense forest for miles",
  "He is accustomed to dealing with difficult clients",
  "We cannot rule out the possibility of further delays",
  "The headline captured attention across social media",
  "She whispered that she needed to leave immediately",
  "The factory will shut down for maintenance next week",
  "I am confident that we can resolve this peacefully",
  "They objected to the way the survey was conducted",
  "The medication should be taken with food twice daily",
  "He pointed out several flaws in our reasoning",
  "We are grateful for your continued support and patience",
  "The river flooded after days of heavy rainfall",
  "She reconciled with her brother after years apart",
  "The internship provides valuable hands on experience",
  "I had better not forget to charge my phone",
  "They circulated a petition demanding policy reform",
  "The architect drew inspiration from local traditions",
  "He was reluctant to share his personal opinions",
  "We will revisit the budget once sales improve",
  "The ceremony honored veterans from every branch",
  "She excels at solving problems under pressure",
  "The password must contain at least twelve characters",
  "I am fed up with waiting for a response",
  "They merged two departments to cut operating costs",
  "The glacier has been shrinking at an alarming rate",
  "He volunteered to organize the charity fundraiser",
  "We ought not to jump to conclusions too quickly",
  "The speaker paused to let the audience reflect",
  "She attributed her recovery to regular exercise",
  "The lawsuit was settled out of court last month",
  "I have no intention of giving up at this stage",
  "They monitored the situation around the clock",
  "The fabric is resistant to both water and stains",
  "He misinterpreted her comment as an insult",
  "We are eager to hear your feedback on the draft",
  "The festival attracts visitors from around the world",
  "She declined the invitation due to prior commitments",
  "The engine failed shortly after takeoff",
  "I would never have guessed he was so talented",
  "They installed security cameras throughout the building",
  "The curriculum has been updated to include coding",
  "He is entitled to compensation under the agreement",
  "We ran into an old colleague at the conference",
  "The painting was stolen from the gallery overnight",
  "She urged the council to act more decisively",
  "The startup secured funding from several angel investors",
  "I am supposed to attend a workshop this afternoon",
  "They underestimated how long the repairs would take",
  "The ambassador condemned the attack in strong terms",
  "He confessed that he had never learned to swim",
  "We are bound by the terms of the confidentiality agreement",
  "The crowd dispersed after the police issued a warning",
  "She filed for divorce after a long separation",
  "The vaccine has proven effective in clinical trials",
  "I have been meaning to call you for weeks",
  "They exported goods worth millions last fiscal year",
  "The hallway echoed with the sound of footsteps",
  "He is notorious for arriving late to every meeting",
  "We must distinguish between correlation and causation",
  "The orchestra rehearsed the symphony for hours",
  "She overcame her fear of public speaking gradually",
  "The landlord raised the rent without prior notice",
  "I am allergic to peanuts and shellfish",
  "They collaborated on a groundbreaking research paper",
  "The summit addressed climate change and food security",
  "He was acquitted due to insufficient evidence",
  "We are reviewing applications on a rolling basis",
  "The chimney spewed smoke into the gray sky",
  "She donated a large portion of her earnings",
  "The algorithm prioritizes content based on engagement",
  "I could not make sense of his explanation",
  "They evacuated the building when the alarm sounded",
  "The manuscript was rejected by three publishers",
  "He is pursuing a doctorate in molecular biology",
  "We should not take their threats lightly",
  "The parade marched down the main street cheerfully",
  "She confessed she had never read the original novel",
  "The currency fluctuated wildly during the crisis",
  "I am wary of deals that sound too good",
  "They harnessed solar power to irrigate the fields",
  "The defendant pleaded guilty to all charges",
  "He refrained from commenting until the investigation ended",
  "We are operating at full capacity this quarter",
  "The sculpture was carved from a single block",
  "She mentored dozens of young entrepreneurs over decades",
  "The outage was caused by a failed transformer",
  "I have grown accustomed to the city noise",
  "They forged a partnership with a leading university",
  "The witness corroborated the victim account",
  "He was exempted from military service for medical reasons",
  "We need to streamline the approval process",
  "The glacier melt threatens coastal communities worldwide",
  "She articulated her vision with remarkable clarity",
  "The treaty prohibits the use of chemical weapons",
  "I am scheduled to present at the symposium",
  "They dismantled the old factory brick by brick",
  "The professor retired after forty years of teaching",
  "He was hailed as a hero for his bravery",
  "We cannot overlook the risks involved",
  "The manuscript reveals insights into medieval life",
  "She negotiated a favorable contract on their behalf",
  "The epidemic spread rapidly through densely populated areas",
  "I have reservations about the proposed amendment",
  "They championed reforms that benefited rural farmers",
  "The lighthouse guided ships through the fog",
  "He was demoted after the scandal became public",
  "We are obligated to report any safety violations",
  "The choir harmonized beautifully during the finale",
  "She scrutinized every line of the legal document",
  "The spacecraft entered orbit without incident",
  "I am torn between accepting the offer or staying",
  "They revoked his license for repeated violations",
  "The epidemic subsided after widespread vaccination",
  "He articulated concerns that many had privately shared",
  "We must reconcile our differences before the vote",
  "The expedition was cut short by a blizzard",
  "She pioneered techniques still used in surgery today",
  "The legislature passed the bill by a narrow margin",
  "I have seldom felt so relieved in my life",
  "They funneled resources into education and healthcare",
  "The defendant appealed the verdict immediately",
  "He was instrumental in brokering the peace deal",
  "We are witnessing a shift in consumer behavior",
  "The archive preserves documents dating back centuries",
  "She rebuffed attempts to influence her decision",
  "The reactor was shut down as a precaution",
  "I am accountable for the team performance this quarter",
  "They galvanized public support through grassroots campaigns",
  "The memoir offers a candid look at her childhood",
  "He was embroiled in controversy for months",
  "We should allocate funds more equitably across regions",
  "The orchard produces apples sold nationwide",
  "She defied expectations by winning the tournament",
  "The pipeline transports oil across three provinces",
  "I have mislaid the keys somewhere in this room",
  "They ratified the agreement after lengthy debate",
  "The curator authenticated the painting as genuine",
  "He was ostracized by colleagues after the leak",
  "We are poised to capitalize on emerging markets",
  "The verdict sent shockwaves through the community",
  "She extrapolated trends from decades of data",
  "The embargo restricted trade for nearly a decade",
  "I am beholden to everyone who supported me",
  "They circumvented regulations through a legal loophole",
  "The avalanche buried the village under tons of snow",
  "He was posthumously awarded the highest civilian honor",
  "We must mitigate the environmental impact of construction",
  "The symposium fostered dialogue among rival factions",
  "She debunked myths surrounding the ancient ritual",
  "The insurgents surrendered after supplies ran out",
  "I have reconciled myself to the inevitable outcome",
  "They proliferated copies of the manifesto underground",
  "The auditor flagged discrepancies in the financial statements",
  "He was complicit in covering up the fraud",
  "We are striving to achieve carbon neutrality by twenty thirty",
  "The monsoon replenished reservoirs across the region",
  "She elucidated complex theories in accessible language",
  "The referendum determined the country future direction",
  "I am skeptical of claims that lack empirical evidence",
  "They nationalized key industries during the crisis",
  "The plague decimated populations throughout Europe",
  "He was indicted on charges of embezzlement",
  "We should cultivate empathy in every classroom",
  "The constellation is visible only in winter skies",
  "She redressed grievances through diplomatic channels",
  "The consortium pooled expertise from twelve institutions",
  "I have vacillated between two equally appealing options",
  "They promulgated new standards for food safety",
  "The despot was overthrown after mass protests",
  "He was lauded for innovations in renewable technology",
  "We are navigating uncharted economic territory",
  "The parchment crumbled when exposed to light",
  "She vindicated her reputation with a stunning victory"
];

const normalizeAnswer = value =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const shuffleArray = items => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Shuffle word chips, but keep each word intact (never scramble letters). */
const shuffleTokensKeepWordsIntact = tokens => {
  if (!Array.isArray(tokens) || tokens.length < 2) {
    return tokens;
  }
  let shuffled = shuffleArray(tokens);
  const sameOrder = shuffled.every((token, index) => token.id === tokens[index].id);
  if (sameOrder) {
    shuffled = [...tokens];
    const last = shuffled.pop();
    shuffled.unshift(last);
  }
  return shuffled;
};

const tokenizeSentence = sentence => {
  const words = String(sentence || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.map((word, index) => ({
    id: `w${index}_${word.toLowerCase().replace(/[^a-z0-9]/gi, '')}`,
    word,
  }));
};

const pickSentence = () => SENTENCE_BANK[Math.floor(Math.random() * SENTENCE_BANK.length)];

const buildChallenge = () => {
  const sentence = pickSentence();
  const tokens = shuffleTokensKeepWordsIntact(tokenizeSentence(sentence));
  return {
    id: `sb_${Date.now()}_random`,
    tokens,
    correct: normalizeAnswer(sentence),
  };
};

const serializeChallenge = challenge => ({
  id: challenge.id,
  tokens: challenge.tokens.map(({ id, word }) => ({ id, word })),
});

const isCorrectAnswer = (challenge, answer) => {
  const normalized = normalizeAnswer(answer);
  if (!normalized || normalized.length < 3) {
    return false;
  }
  return normalized === challenge.correct;
};

const pickBotAnswer = (challenge, shouldBeCorrect = true) => {
  if (shouldBeCorrect) {
    return challenge.tokens
      .slice()
      .sort((a, b) => {
        const ai = Number(String(a.id).match(/^w(\d+)/)?.[1] ?? 0);
        const bi = Number(String(b.id).match(/^w(\d+)/)?.[1] ?? 0);
        return ai - bi;
      })
      .map(t => t.word)
      .join(' ');
  }
  const shuffled = shuffleArray(challenge.tokens);
  return shuffled.map(t => t.word).join(' ');
};

const calcSentenceBuilderExp = (finalScore, rank = 5) => {
  const safeScore = Math.max(0, Number(finalScore) || 0);
  const base = Math.floor(safeScore / 10);
  const winBonus = rank === 1 ? 3 : rank === 2 ? 1 : 0;
  return Math.max(safeScore > 0 ? 1 : 0, base + winBonus);
};

module.exports = {
  QUESTION_COUNT: SENTENCE_BANK.length,
  MATCH_DURATION_MS: 5 * 60 * 1000,
  POINTS_CORRECT: 15,
  POINTS_WRONG: 5,
  buildChallenge,
  serializeChallenge,
  isCorrectAnswer,
  normalizeAnswer,
  shuffleArray,
  tokenizeSentence,
  pickBotAnswer,
  randomBotName,
  calcSentenceBuilderExp,
};
