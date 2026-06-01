/** 5-letter French words (ASCII, no accents) for Sudoword. */
const SUDOWORD_WORD_BANK = [
  'LIVRE',
  'MONDE',
  'MAINS',
  'VERTE',
  'RADIO',
  'PLAGE',
  'FELIX',
  'RAPID',
  'LENTO',
  'CHAUD',
  'FROID',
  'PLUIE',
  'VENTO',
  'NEIGE',
  'TABLE',
  'MAISO',
  'PORTE',
  'ROUTE',
  'AMOUR',
  'FETES',
  'ECOLE',
  'VOITU',
  'BATEA',
  'CHAMP',
  'MATIN',
  'SOIRE',
  'NUITS',
  'CIELS',
  'FORET',
  'VILLE',
];

const SUDOWORD_FILTERED = SUDOWORD_WORD_BANK.filter(word => word.length === 5);

const SYNOWORD_BANK = [
  { word: 'HEUREUX', synonyms: ['JOIE', 'GAI', 'CONTENT', 'RADIEU'] },
  { word: 'TRISTE', synonyms: ['PEINE', 'SOMBRE', 'MELAN', 'DEUIL'] },
  { word: 'GRAND', synonyms: ['VASTE', 'LARGE', 'GEANT', 'HAUT'] },
  { word: 'PETIT', synonyms: ['MINCE', 'COURT', 'BREF', 'MINI'] },
  { word: 'RAPIDE', synonyms: ['VITE', 'AGILE', 'PRESSE', 'HATE'] },
  { word: 'LENT', synonyms: ['TARD', 'PAUSE', 'CALME', 'MOROS'] },
  { word: 'CHAUD', synonyms: ['TIEDE', 'ARDENT', 'DOUX', 'TEMPL'] },
  { word: 'FROID', synonyms: ['GLACE', 'FRAIS', 'GELID', 'FRAIS'] },
  { word: 'BEAU', synonyms: ['JOLI', 'BEL', 'FIN', 'CLAIR'] },
  { word: 'FORT', synonyms: ['ROBUST', 'PUISS', 'SOLID', 'DUR'] },
  { word: 'FAIBLE', synonyms: ['FRAGIL', 'DOUX', 'TENDR', 'MOU'] },
  { word: 'NEUF', synonyms: ['FRAIS', 'JEUNE', 'MODER', 'RECEN'] },
  { word: 'VIEUX', synonyms: ['ANCIE', 'VIEUX', 'PASSE', 'USE'] },
  { word: 'FACILE', synonyms: ['SIMPLE', 'CLAIR', 'LEGER', 'BASIC'] },
  { word: 'DIFFICILE', synonyms: ['DUR', 'ARDU', 'LOURD', 'COMP'] },
  { word: 'PROCHE', synonyms: ['PRES', 'JUSTE', 'VOISI', 'PRES'] },
  { word: 'LOIN', synonyms: ['LOINT', 'LOIN', 'ABSEN', 'ELAIG'] },
  { word: 'OUVERT', synonyms: ['LIBRE', 'CLAIR', 'LIBRE', 'PUBLIC'] },
  { word: 'FERME', synonyms: ['CLOS', 'SCELLE', 'BLOQU', 'PRIVE'] },
];

const ANTOWORD_BANK = [
  { word: 'HEUREUX', antonyms: ['TRISTE', 'PEINE', 'SOMBRE'] },
  { word: 'GRAND', antonyms: ['PETIT', 'MINCE', 'COURT'] },
  { word: 'RAPIDE', antonyms: ['LENT', 'TARD', 'PAUSE'] },
  { word: 'CHAUD', antonyms: ['FROID', 'GLACE', 'FRAIS'] },
  { word: 'NEUF', antonyms: ['VIEUX', 'ANCIE', 'USE'] },
  { word: 'FACILE', antonyms: ['DIFFICILE', 'DUR', 'ARDU'] },
  { word: 'FORT', antonyms: ['FAIBLE', 'FRAGIL', 'DOUX'] },
  { word: 'OUVERT', antonyms: ['FERME', 'CLOS', 'BLOQU'] },
  { word: 'JOUR', antonyms: ['NUIT', 'SOIR', 'SOMBRE'] },
  { word: 'MONTER', antonyms: ['DESCEND', 'TOMBER', 'BAS'] },
  { word: 'ENTRER', antonyms: ['SORTIR', 'FUIR', 'QUITTE'] },
  { word: 'AIMER', antonyms: ['HAIR', 'DETES', 'ABHOR'] },
  { word: 'VRAI', antonyms: ['FAUX', 'MENSON', 'TROMP'] },
  { word: 'PLEIN', antonyms: ['VIDE', 'CREUX', 'MANQU'] },
  { word: 'PROPRE', antonyms: ['SALE', 'TACHE', 'IMOND'] },
];

const STORY_BANK = [
  {
    title: 'Le café du matin',
    body: 'Je bois du café chaque matin. Aujourd\'hui j\'ai raté le train et je suis arrivé en retard. À la gare j\'ai ouvert mon carnet et noté des idées pour la réunion. Le train suivant était en retard et la réunion aussi. J\'ai ri doucement parce que le stress n\'a pas aidé.',
  },
  {
    title: 'Une lettre de chez soi',
    body: 'Une lettre de ma grand-mère est arrivée un mardi pluvieux. Elle contenait des photos et une recette de soupe d\'enfance. Ce soir-là j\'ai cuisiné et invité des voisins. Nous avons parlé de mots chaleureux et j\'ai promis de rendre visite avant l\'hiver.',
  },
  {
    title: 'La première présentation',
    body: 'Je n\'ai jamais parlé en public jusqu\'à ce que mon équipe me choisisse. Pendant des semaines j\'ai répété dans des salles vides. Sur scène mes mains tremblaient mais la première blague a fait rire tout le monde. La confiance a grandi phrase après phrase. Un étudiant a dit que la recherche semblait humaine.',
  },
];

module.exports = {
  SUDOWORD_WORD_BANK: SUDOWORD_FILTERED,
  SYNOWORD_BANK,
  ANTOWORD_BANK,
  STORY_BANK,
};
