import fs from 'fs';

const path = new URL('../src/realtime/storyRushPuzzles.js', import.meta.url);

const STORIES = [
  {
    title: 'The Missed Train',
    body: `Maya reached the platform just as the doors slid shut. She had woken late after ignoring her alarm twice. Her presentation would begin in twenty minutes across the city. Instead of panicking, she opened her laptop and drafted talking points while waiting for the next train. When she finally arrived, breathless but prepared, her manager admitted the meeting had been delayed. Maya laughed, realizing stress had stolen an hour she could have used calmly.`,
  },
  {
    title: 'A Letter from Home',
    body: `The envelope arrived on a rainy Tuesday, stamped with her grandmother handwriting. Inside were photographs and a recipe for soup that smelled like childhood. She read the letter three times, hearing her grandmother voice in every sentence. That evening she cooked the soup and invited neighbors who had never met her family. They asked about the woman who wrote such warm words. She promised to visit home before winter ended.`,
  },
  {
    title: 'The Night Market',
    body: `Lanterns swayed above narrow alleys where vendors shouted prices over sizzling pans. Tourists photographed everything while locals navigated the crowd with practiced ease. He followed the scent of spices until he found a stall selling tea from remote mountains. The vendor explained how leaves were picked at dawn. They talked until the market closed, and he left with stories heavier than his bag.`,
  },
  {
    title: 'Borrowed Courage',
    body: `She had never spoken in public until her team nominated her for the conference. For weeks she practiced in empty rooms, recording herself and deleting takes she disliked. On stage her hands trembled, but her first joke earned a laugh. Confidence did not arrive instantly; it grew with each sentence. Afterwards a student thanked her for making research feel human. She understood courage could be borrowed until it became her own.`,
  },
  {
    title: 'The Broken Compass',
    body: `The hiking group trusted the compass until it spun without direction. Clouds hid the sun, and trails forked into identical pines. They debated turning back while daylight faded. The quietest member studied moss and slope, suggesting a descent toward the river they had crossed earlier. Hours later they emerged near camp, grateful for observation skills no device could replace.`,
  },
  {
    title: 'City in Winter',
    body: `Frost outlined windows where families gathered around small celebrations. Street musicians played despite numb fingers, and shopkeepers offered samples to passersby. She walked without headphones, listening to boots on ice and distant trains. A child handed her a paper star. She pinned it inside her coat and felt less alone during a season that often demanded performance of happiness.`,
  },
  {
    title: 'The Internship',
    body: `His first assignment was to organize archives everyone else avoided. Dust rose as he labeled boxes from decades no one remembered. An elderly volunteer noticed his curiosity and told stories behind faded photographs. By summer end he had digitized records and written summaries linking names to events. The director offered him a permanent role, surprised that patience had uncovered institutional memory.`,
  },
  {
    title: 'Parallel Lives',
    body: `Two strangers boarded the same delayed flight and discovered they had studied in the same city years apart. They compared neighborhoods, professors, and restaurants until departure felt like reunion. One was relocating for work; the other returning from a funeral. Their conversation shifted from nostalgia to grief to hope. When boarding began, they exchanged contacts, agreeing that chance meetings sometimes repair timelines.`,
  },
  {
    title: 'The Garden Experiment',
    body: `She planted seeds in containers on a balcony that received four hours of sun. Online forums argued about soil and drainage while her plants wilted regardless. Instead of quitting, she tracked sunlight patterns and moved pots weekly. Tomatoes arrived late but tasted sweeter for the effort. Neighbors began asking advice, amused that failure had made her an unlikely expert.`,
  },
  {
    title: 'After the Interview',
    body: `He replayed every answer on the train home, convinced he had talked too much about hobbies. His phone remained silent for days until an email offered a second conversation. They wanted to discuss collaboration, not credentials. Relief mixed with fear because the role would require skills he was still learning. He accepted, deciding growth mattered more than appearing finished.`,
  },
  {
    title: 'The Power Outage',
    body: `Lights died across the block during the season hottest week. Families dragged chairs outside where air moved freely. Someone brought a guitar; another shared melted ice cream before it spoiled. Children invented games that required no screens. When electricity returned at midnight, few hurried inside. They had remembered conversation as entertainment.`,
  },
  {
    title: 'Translation',
    body: `The novel she loved had never been published in her language. She began translating chapters at night after work, unsure anyone would read them. Online readers corrected phrases and debated word choice. A small press noticed the project and offered a contract. At the launch, she thanked strangers who had taught her that language is a shared construction.`,
  },
  {
    title: 'The Rescue Dog',
    body: `The shelter warned that the dog had been returned twice for anxiety. He sat in corners during the first week, flinching at sudden sounds. Consistent walks and quiet voices slowly built trust. One morning the dog rested a head on his knee while he read news. Adoption paperwork felt less like charity and more like partnership.`,
  },
  {
    title: 'Under the Eclipse',
    body: `Scientists and tourists gathered on a hill where clouds had been absent for days. Glasses passed between strangers as the sky darkened. Temperature dropped; birds fell silent. Someone whispered that darkness made ordinary light precious. When the eclipse ended, applause rose not for spectacle but for return of daily miracles.`,
  },
  {
    title: 'The Startup Pitch',
    body: `They had rehearsed slides until numbers blurred, yet investors asked questions no deck anticipated. One partner improvised answers while another tracked objections. Rejection emails arrived first, then interest from an unexpected mentor. Funding was smaller than dreamed but included guidance. They learned pitches sell conversations, not certainty.`,
  },
  {
    title: 'Learning to Swim',
    body: `Adults surrounded the pool edge while children dove confidently. She entered slowly, embarrassed by fear she had hidden for decades. An instructor praised floating more than speed. Each lesson reduced panic until she crossed a lane without stopping. Victory was not athletic; it was permission to be beginner at any age.`,
  },
  {
    title: 'The Archive Fire',
    body: `Smoke alarms woke staff before flames reached rare manuscripts. Volunteers formed chains passing boxes into rain. Digital backups existed for some collections, but handwritten notes held irreplaceable margins. Restoration teams worked for months, stabilizing charred pages. The incident reshaped policy: preservation required redundancy and community readiness.`,
  },
  {
    title: 'Midnight Bakery',
    body: `Flour dust floated under fluorescent lights while ovens warmed the street. Bakers spoke little, synchronized by timers and habit. She arrived for a trial shift expecting glamour and found labor. By dawn racks held bread that would feed commuters who never considered its origin. Pride arrived with exhaustion.`,
  },
  {
    title: 'The Debate Team',
    body: `Arguments in class had been chaotic until coaches taught structure. Students researched evidence instead of volume. They lost tournaments but improved rebuttals. A judge noted one speaker ability to summarize opponents fairly before disagreeing. Parents attended finals, surprised that competition had taught listening.`,
  },
  {
    title: 'Crossing Borders',
    body: `Documents filled folders she carried in a bag worn thin at corners. Each office repeated questions about purpose and duration. Interpreters helped when language failed. A stamp finally allowed passage to a country where family waited. Relief was physical, as if her shoulders had been holding walls.`,
  },
  {
    title: 'The Telescope Gift',
    body: `Her grandfather assembled a telescope on the roof despite arthritis. They focused on craters while he described missions he had watched on television. Light pollution limited visibility, yet Jupiter appeared as a bright defect. She later studied astrophysics, citing nights when science felt like family tradition.`,
  },
  {
    title: 'Repair Cafe',
    body: `Volunteers labeled tables for electronics, textiles, and furniture. Residents brought broken items they might otherwise discard. Conversation flowed alongside soldering irons and needles. A child learned to sew a torn backpack strap. The event proved sustainability could be social before it was technical.`,
  },
  {
    title: 'The Quiet Room',
    body: `Libraries had added a space without devices where visitors could sit in silence. Skeptics mocked the idea until waitlists formed. Students napped between exams; caregivers breathed without monitoring screens. Noise outside continued, but the room demonstrated demand for stillness in cities built on distraction.`,
  },
  {
    title: 'Flood Season',
    body: `Rivers swelled after weeks of rain, threatening neighborhoods built on reclaimed land. Sandbags appeared overnight as volunteers coordinated through messages. Families evacuated with pets and photographs. When water receded, mud remained, but so did records of strangers helping strangers without waiting for instructions.`,
  },
  {
    title: 'The Mentorship',
    body: `He expected a mentor to provide answers and instead received questions that exposed assumptions. Monthly meetings tracked goals he had avoided naming. Failures were discussed without shame. Years later he mentored another student using the same method, understanding guidance as companionship through uncertainty.`,
  },
  {
    title: 'Street Art Tour',
    body: `A guide explained murals created without permission yet celebrated by communities. Artists used walls to document history excluded from textbooks. Tourists photographed work that might be painted over within months. She left considering how cities remember through pigment and risk.`,
  },
  {
    title: 'The Lab Mistake',
    body: `A contaminated sample ruined weeks of work hours before submission. The team met without blaming individuals, reviewing protocols instead. Adjustments prevented larger errors later. The paper published with a section acknowledging setbacks. Science advanced through correction as much as discovery.`,
  },
  {
    title: 'Returning to Piano',
    body: `Keys felt unfamiliar after a decade away from practice. Muscle memory returned slowly, accompanied by frustration. She scheduled short sessions to avoid associating music with failure. A neighbor knocked once to say scales sounded gentle through walls. Progress became private performance.`,
  },
  {
    title: 'The Food Festival',
    body: `Chefs collaborated with farmers to showcase ingredients threatened by industrial supply chains. Tasting portions told stories of soil and season. Visitors debated whether flavor justified price. Contracts signed behind tents linked restaurants to local growers. Culture and economy shared a table.`,
  },
  {
    title: 'Night Shift Nurse',
    body: `Hallways quieted while monitors continued beeping. She checked patients who slept unaware of holidays outside. Families called for updates at hours when most offices closed. Compassion was measured in small adjustments: extra blanket, translated phrase, patience. Dawn brought handoffs and fatigue she carried home.`,
  },
  {
    title: 'The Scholarship',
    body: `Tuition had seemed impossible until a letter confirmed partial funding tied to community service. She organized tutoring for younger students, discovering she learned by teaching. Grades improved alongside confidence. Graduation speech thanked donors, but emphasized reciprocity already underway in her neighborhood.`,
  },
  {
    title: 'Desert Highway',
    body: `Heat shimmered above asphalt stretching toward horizons without signs. They rationed water after a miscalculation left the map outdated. A truck appeared eventually, driven by a rancher who did not ask why they had come. Stories exchanged during the ride mattered more than arrival time.`,
  },
  {
    title: 'The Podcast',
    body: `Episodes began in a closet lined with blankets for sound. Downloads remained low until one interview resonated unexpectedly. Listeners sent voice messages describing commutes changed by episodes. Sponsorship followed, but production stayed modest. Authenticity had been the algorithm all along.`,
  },
  {
    title: 'Community Kitchen',
    body: `Volunteers prepared meals from donations that varied daily. Recipes adapted to available ingredients without sacrificing dignity. Guests ate at shared tables without proving need. Funding proposals cited nutrition, yet volunteers knew hunger was also isolation. Conversation was served alongside soup.`,
  },
  {
    title: 'The Audit',
    body: `Accountants arrived with checklists that made staff nervous. Months of receipts surfaced from drawers and inboxes. Discrepancies appeared minor but revealed habits worth changing. Recommendations were implemented slowly. Transparency became routine rather than emergency response.`,
  },
  {
    title: 'Learning Sign Language',
    body: `She enrolled after a coworker mentioned meetings without interpreters. Fingers ached from new shapes; grammar differed from spoken English. Deaf colleagues corrected her gently. Inclusion expanded beyond vocabulary to awareness of who had been excluded from casual information.`,
  },
  {
    title: 'The Storm Chasers',
    body: `Meteorology students tracked systems across plains where skies turned green. Instruments measured pressure while cameras documented rotation. Risk was calculated, not romanticized. Data collected informed warnings that reached towns hours later. Respect for weather replaced thrill seeking.`,
  },
  {
    title: 'Vintage Market',
    body: `Sellers displayed objects carrying histories buyers could only guess. A typewriter still functioned; a coat smelled of cedar. Negotiation mixed nostalgia with economics. She purchased letters never mailed, wondering about voices silenced by time.`,
  },
  {
    title: 'The Clinic Line',
    body: `Numbers were called in a waiting room where languages mixed. Volunteers translated forms while children colored on floors. Appointments ran late, yet staff remained courteous. A physician stayed an hour past shift to see final patient. Healthcare revealed itself as logistics and empathy combined.`,
  },
  {
    title: 'Building a Bridge',
    body: `Engineers debated materials while residents demanded input about noise and shadow. Models projected decades of use. Construction paused for inspections that frustrated commuters. Opening day ceremonies included schoolchildren who would cross daily. Infrastructure was relationship maintained, not steel alone.`,
  },
  {
    title: 'The Chess Tournament',
    body: `Silence ruled the hall except for clocks ticking down. Players recorded moves without speaking. A child prodigy drew crowds, but an elderly woman won through patience. Analysis afterwards revealed mistakes that had looked like strategy. Competition clarified thinking under pressure.`,
  },
  {
    title: 'Solar Installation',
    body: `Panels arrived on roofs subsidized by grants promoting renewable energy. Workers explained maintenance to homeowners skeptical of technology. Bills decreased gradually, changing minds more than slogans. Neighborhoods shared data about savings. Transition was incremental, not instantaneous.`,
  },
  {
    title: 'The Memoir Class',
    body: `Participants wrote scenes from memory, uncertain anyone would read them. Critique focused on honesty rather than polish. One story about migration moved listeners to tears. Publication was not the goal; witness was. Writing became archive of lives rarely documented.`,
  },
  {
    title: 'Firefly Evening',
    body: `Fields flickered with insects signaling in patterns scientists still study. Children chased lights until adults explained fragility of habitat. Darkness required protection from phones. Collective quiet amplified blinking constellations near grass. Wonder needed absence of illumination.`,
  },
  {
    title: 'The Merger',
    body: `Employees from competing firms shared elevators and suspicion. Town halls addressed rumors with incomplete answers. Teams merged slowly through projects that required collaboration. Some left; others built new culture from negotiated values. Corporate change was human adjustment scaled upward.`,
  },
  {
    title: 'Coastal Cleanup',
    body: `Volunteers collected plastic along shorelines, sorting debris for analysis. Data would inform policy, but immediate impact was visible shoreline. A turtle rescue team coordinated nearby. Participants returned sunburned and purposeful. Environmental action began with hands, not headlines.`,
  },
  {
    title: 'The Orchestra Rehearsal',
    body: `Musicians tuned strings and reeds before conductor raised baton. Discord gradually aligned into passages they had practiced separately. Mistakes were corrected without humiliation. Performance would be shared risk. Harmony required listening as much as skill.`,
  },
  {
    title: 'Remote Village Clinic',
    body: `A doctor traveled hours on roads that narrowed to paths. Supplies were limited; diagnoses relied on observation. Patients brought gifts instead of payment. Telemedicine later connected the clinic to specialists. Technology extended care without replacing presence.`,
  },
  {
    title: 'The Hackathon',
    body: `Teams coded through night fueled by coffee and deadlines. Prototypes addressed problems sponsors outlined. Sleep deprivation produced bugs and laughter. Winners received modest prizes but significant introductions. Innovation weekends were networking disguised as competition.`,
  },
  {
    title: 'Autumn Marathon',
    body: `Runners stretched while city slept, bibs pinned over layered clothing. Paces varied from elite to charitable. Crowds cheered strangers whose names they read on shirts. Finish lines blurred exhaustion with accomplishment. Endurance was communal spectacle.`,
  },
  {
    title: 'The Courtroom',
    body: `Arguments referenced precedents while jurors listened without expression. Witnesses swore oaths that did not prevent nervous speech. Verdicts would alter lives beyond the courtroom walls. Observers left considering how law translated morality into procedure.`,
  },
  {
    title: 'Space Exhibit',
    body: `Models of rockets hung above capsules that had carried astronauts. Children pressed buttons activating narrations. Adults remembered broadcasts from decades past. Science museums turned history into tactile curiosity. Exploration continued through education as much as launches.`,
  },
  {
    title: 'The Beekeeper',
    body: `Protective gear could not hide his calm while bees swarmed around frames heavy with honey. He explained colony collapse to visitors who tasted samples on crackers. Pollination connected farms to survival. Sweetness carried responsibility.`,
  },
  {
    title: 'Refugee Center',
    body: `Interpreters helped families navigate forms in languages newly learned. Children attended classes while parents searched employment. Donations arrived irregularly; needs did not. Volunteers documented stories for advocacy. Displacement was bureaucracy experienced personally.`,
  },
  {
    title: 'The Lighthouse Keeper',
    body: `Lamps rotated through fog that swallowed ships without warning. Logs recorded weather and repairs in careful script. Automation threatened the post, yet tourists visited seeking romance of isolation. Keeper knew solitude was work, not aesthetic.`,
  },
  {
    title: 'Urban Farming',
    body: `Rooftop beds produced greens sold to restaurants downstairs. Soil traveled upward in elevators alongside skeptics. Harvests were modest but symbolic. Chefs highlighted origin on menus. Cities reconsidered what growth could mean vertically.`,
  },
  {
    title: 'The Negotiation',
    body: `Parties entered rooms with positions hardened by public statements. Mediators reframed issues until interests appeared beneath demands. Agreement emerged incomplete but durable. Signing was quiet compared to press conferences. Peace was maintenance scheduled in calendars.`,
  },
  {
    title: 'Final Rehearsal',
    body: `Actors stumbled lines they had known for weeks, fatigue visible under makeup. Director called notes that reshaped scenes minutes before opening. Stagehands adjusted lights. Audience would arrive tomorrow unaware of chaos backstage. Performance was collective concealment of doubt.`,
  },
];

if (STORIES.length < 50) {
  throw new Error(`Need 50+ stories, got ${STORIES.length}`);
}

const body = `const { randomBotName } = require('./sudowordPuzzles');

const STORY_BANK = ${JSON.stringify(STORIES, null, 2)};

const READ_ROUND_MS = 60 * 1000;
const MATCH_DURATION_MS = 5 * 60 * 1000;
const POINTS_FINISH_RANK = [18, 14, 11, 8, 5];
const MAX_ACCURACY_POINTS = 12;
const MAX_SPEED_POINTS = 8;

const pickStory = () => STORY_BANK[Math.floor(Math.random() * STORY_BANK.length)];

const buildChallenge = () => {
  const story = pickStory();
  const roundEndsAt = Date.now() + READ_ROUND_MS;
  return {
    id: \`sr_\${Date.now()}_\${Math.random().toString(36).slice(2, 7)}\`,
    title: story.title,
    body: story.body,
    roundEndsAt,
    wordCount: story.body.split(/\\s+/).filter(Boolean).length,
  };
};

const serializeChallenge = challenge => ({
  id: challenge.id,
  title: challenge.title,
  body: challenge.body,
  roundEndsAt: challenge.roundEndsAt,
  wordCount: challenge.wordCount,
});

const parseSubmit = payload => {
  const correctWords = Math.max(0, Math.floor(Number(payload.correctWords) || 0));
  const wrongWords = Math.max(0, Math.floor(Number(payload.wrongWords) || 0));
  const totalWords = Math.max(1, Math.floor(Number(payload.totalWords) || 1));
  const finishMs = Math.max(0, Math.floor(Number(payload.finishMs) || READ_ROUND_MS));
  return { correctWords, wrongWords, totalWords, finishMs };
};

const calcRoundPoints = (submit, finishRank, finishedInTime) => {
  if (!finishedInTime) {
    return { accuracyPoints: 0, speedPoints: 0, rankBonus: 0, total: 0 };
  }
  const accuracyRatio = Math.min(1, submit.correctWords / submit.totalWords);
  const accuracyPoints = Math.round(accuracyRatio * MAX_ACCURACY_POINTS);
  const timeLeftMs = Math.max(0, READ_ROUND_MS - submit.finishMs);
  const speedPoints = Math.round((timeLeftMs / READ_ROUND_MS) * MAX_SPEED_POINTS);
  const rankBonus = POINTS_FINISH_RANK[Math.min(finishRank, POINTS_FINISH_RANK.length - 1)] || 0;
  const total = accuracyPoints + speedPoints + rankBonus;
  return { accuracyPoints, speedPoints, rankBonus, total };
};

const calcStoryRushExp = (finalScore, rank = 5) => {
  const safeScore = Math.max(0, Number(finalScore) || 0);
  const base = Math.floor(safeScore / 10);
  const winBonus = rank === 1 ? 3 : rank === 2 ? 1 : 0;
  return Math.max(safeScore > 0 ? 1 : 0, base + winBonus);
};

module.exports = {
  STORY_COUNT: STORY_BANK.length,
  READ_ROUND_MS,
  MATCH_DURATION_MS,
  buildChallenge,
  serializeChallenge,
  parseSubmit,
  calcRoundPoints,
  calcStoryRushExp,
  randomBotName,
};
`;

fs.writeFileSync(path, body);
console.log(`Wrote ${STORIES.length} stories`);
