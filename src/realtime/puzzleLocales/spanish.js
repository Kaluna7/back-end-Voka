/** 5-letter Spanish words (ASCII, no accents) for Sudoword. */
const SUDOWORD_WORD_BANK = [
  'LIBRO',
  'MUNDO',
  'MANOS',
  'VERDE',
  'RADIO',
  'PLATA',
  'FUEGO',
  'AGUAS',
  'CALLE',
  'FELIZ',
  'LENTO',
  'CALOR',
  'NIEVE',
  'SILLA',
  'HOGAR',
  'PLAYA',
  'CLASE',
  'TARDE',
  'NOCHE',
  'CIELO',
  'VENTA',
  'PERRO',
  'GATOS',
  'LECHE',
  'PANES',
  'MESAS',
  'ROCAS',
  'NUBES',
  'PINOS',
  'BARCO',
];

const SUDOWORD_FILTERED = SUDOWORD_WORD_BANK.filter(word => /^[A-Z]{5}$/.test(word));

/** Synonym prompts (A–Z normalized on submit). */
const SYNOWORD_BANK = [
  { word: 'FELIZ', synonyms: ['ALEGRE', 'CONTENT', 'GOZOSO', 'RADIANT'] },
  { word: 'TRISTE', synonyms: ['APENADO', 'MELANC', 'SOMBRIO', 'LUTO'] },
  { word: 'GRANDE', synonyms: ['ENORME', 'VASTO', 'GIGANTE', 'MAYOR'] },
  { word: 'PEQUE', synonyms: ['CHICO', 'MENOR', 'MINI', 'REDUCID'] },
  { word: 'RAPIDO', synonyms: ['VELOZ', 'AGIL', 'PRESTO', 'PRONTO'] },
  { word: 'LENTO', synonyms: ['TARDIO', 'PAUSADO', 'CALMADO', 'MOROSO'] },
  { word: 'CALIDO', synonyms: ['TIBIO', 'ARDIENT', 'CALOR', 'TEMPLAD'] },
  { word: 'FRIO', synonyms: ['HELADO', 'GLACIAL', 'FRESCO', 'GELIDO'] },
  { word: 'BONITO', synonyms: ['LINDO', 'HERMOSO', 'BELLO', 'PRECIOS'] },
  { word: 'FEO', synonyms: ['HORRIBLE', 'FEO', 'ASQUER', 'BRUTO'] },
  { word: 'FUERTE', synonyms: ['ROBUSTO', 'POTENTE', 'SOLIDO', 'FIRME'] },
  { word: 'DEBIL', synonyms: ['FRAGIL', 'FLOJO', 'DELGAD', 'SUAVE'] },
  { word: 'NUEVO', synonyms: ['RECIENT', 'FRESCO', 'MODERNO', 'JOVEN'] },
  { word: 'VIEJO', synonyms: ['ANTIGUO', 'VIEJO', 'PASADO', 'USADO'] },
  { word: 'FACIL', synonyms: ['SENCILLO', 'SIMPLE', 'CLARO', 'LIGERO'] },
  { word: 'DIFICIL', synonyms: ['DURO', 'TOUGH', 'ARDUO', 'COMPLEJ'] },
  { word: 'CERCA', synonyms: ['PROXIMO', 'JUNTO', 'VECINO', 'ADJACEN'] },
  { word: 'LEJOS', synonyms: ['DISTANT', 'REMOTO', 'LEJANO', 'AUSENTE'] },
  { word: 'ABIERTO', synonyms: ['LIBRE', 'EXPUEST', 'ACCESO', 'PUBLICO'] },
  { word: 'CERRADO', synonyms: ['CERRADO', 'BLOQUEA', 'SELLADO', 'PRIVADO'] },
];

const ANTOWORD_BANK = [
  { word: 'FELIZ', antonyms: ['TRISTE', 'APENADO', 'SOMBRIO'] },
  { word: 'GRANDE', antonyms: ['PEQUE', 'CHICO', 'MENOR'] },
  { word: 'RAPIDO', antonyms: ['LENTO', 'TARDIO', 'PAUSADO'] },
  { word: 'CALIENTE', antonyms: ['FRIO', 'HELADO', 'FRESCO'] },
  { word: 'NUEVO', antonyms: ['VIEJO', 'ANTIGUO', 'USADO'] },
  { word: 'FACIL', antonyms: ['DIFICIL', 'DURO', 'ARDUO'] },
  { word: 'FUERTE', antonyms: ['DEBIL', 'FRAGIL', 'FLOJO'] },
  { word: 'ABIERTO', antonyms: ['CERRADO', 'BLOQUEA', 'SELLADO'] },
  { word: 'DIA', antonyms: ['NOCHE', 'TARDE', 'OSCURID'] },
  { word: 'SUBIR', antonyms: ['BAJAR', 'CAER', 'DESCEND'] },
  { word: 'ENTRAR', antonyms: ['SALIR', 'HUIR', 'ESCAPAR'] },
  { word: 'AMAR', antonyms: ['ODIAR', 'DETEST', 'ABORREC'] },
  { word: 'VERDAD', antonyms: ['MENTIRA', 'FALSO', 'ENGANO'] },
  { word: 'LLENO', antonyms: ['VACIO', 'HUECO', 'FALTA'] },
  { word: 'LIMPIO', antonyms: ['SUCIO', 'MANCHAD', 'TORPE'] },
];

const STORY_BANK = [
  {
    title: 'El café de la mañana',
    body: 'Bebo café cada mañana. Hoy perdí el tren y llegué tarde. En la estación abrí mi cuaderno y escribí ideas para la reunión. El siguiente tren llegó con retraso y la reunión también. Reí en silencio porque el estrés no ayudó.',
  },
  {
    title: 'Una carta de casa',
    body: 'Llegó una carta de mi abuela un martes lluvioso. Traía fotos y la receta de una sopa de la infancia. Esa noche cociné y llamé a mis vecinos. Hablamos de palabras cálidas y prometí visitar antes del invierno.',
  },
  {
    title: 'La primera presentación',
    body: 'Nunca hablé en público hasta que mi equipo me eligió. Practiqué en salas vacías durante semanas. En el escenario temblaron mis manos pero la primera broma hizo reír a todos. La confianza creció frase por frase. Un estudiante dijo que la investigación se sintió humana.',
  },
];

module.exports = {
  SUDOWORD_WORD_BANK: SUDOWORD_FILTERED,
  SYNOWORD_BANK,
  ANTOWORD_BANK,
  STORY_BANK,
};
