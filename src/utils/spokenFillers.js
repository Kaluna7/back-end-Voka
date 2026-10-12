/**
 * Laughs, hesitation sounds and stage directions that text-to-speech reads out
 * literally ("haha" → "huh huh"). Teachers should sound professional on calls,
 * so these are removed from anything that will be spoken.
 */
const FILLER_WORD =
  /(^|[\s,.!?;:])(?:ha(?:ha)+h?|ah(?:ah)+|he(?:he)+|hi(?:hi)+|hah|heh|huh|hm+|mm+|uh+|um+|erm|lol|wkwk\w*|hehe\w*)(?=[\s,.!?;:]|$)[,.!]?/gi;
const NON_LATIN_LAUGH = /(?:[はハ]{2,}|[ふフ]{2,}|[へヘ]{2,}|（笑）|\(笑\)|ㅋ{2,}|ㅎ{2,}|哈{2,}|呵{2,}|嘿{2,})[。、！!,]?/g;
const STAGE_DIRECTION = /\*[^*\n]{1,40}\*|\((?:laughs?|chuckles?|giggles?|smiles?|sighs?)\)/gi;

const stripSpokenFillers = text =>
  String(text || '')
    .replace(STAGE_DIRECTION, ' ')
    .replace(FILLER_WORD, '$1')
    .replace(NON_LATIN_LAUGH, '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/([,.!?])\1+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');

/**
 * Streaming version: words can be split across deltas, so only text up to the last
 * word break is filtered and released; the tail waits for the next delta (or flush()).
 */
const createSpokenFillerFilter = () => {
  let pending = '';
  let started = false;

  const tidyStart = out => {
    if (started) {
      return out;
    }
    const trimmed = out.replace(/^[\s,.!?;:]+/, '');
    if (trimmed) {
      started = true;
    }
    return trimmed;
  };

  return {
    push(delta) {
      pending += String(delta || '');
      const cut = Math.max(
        pending.lastIndexOf(' '),
        pending.lastIndexOf('\n'),
        pending.lastIndexOf(','),
        pending.lastIndexOf('.'),
        pending.lastIndexOf('!'),
        pending.lastIndexOf('?'),
        pending.lastIndexOf('。'),
        pending.lastIndexOf('、'),
        pending.lastIndexOf('，'),
        pending.lastIndexOf('！'),
        pending.lastIndexOf('？'),
      );
      if (cut < 0) {
        return '';
      }
      const ready = pending.slice(0, cut + 1);
      pending = pending.slice(cut + 1);
      return tidyStart(stripSpokenFillers(ready));
    },
    flush() {
      const rest = pending;
      pending = '';
      return tidyStart(stripSpokenFillers(rest));
    },
  };
};

module.exports = { stripSpokenFillers, createSpokenFillerFilter };
