/** Remove chat/roleplay markdown before speech synthesis. */
const stripMarkdownForTts = text =>
  String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isSpeakableTtsText = text => {
  const clean = stripMarkdownForTts(text);
  if (!clean) {
    return false;
  }
  const letters = clean.replace(/[^\p{L}\p{N}]/gu, '');
  return letters.length >= 2;
};

module.exports = {
  stripMarkdownForTts,
  isSpeakableTtsText,
};
