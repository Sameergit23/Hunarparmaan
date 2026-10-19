/**
 * Spelling-proof keys for matching what a worker said with the trade pack's
 * glossary. Vosk writes Hindi in Devanagari ("अर्थिंग"), while the glossary is
 * romanised Hinglish and English ("earthing", "arthing"). Both are reduced to
 * a consonant skeleton ("rtng"): vowels, aspiration and doubled letters are
 * where romanisations disagree most, so they are dropped.
 */

const CONSONANTS: Record<string, string> = {
  क: 'k',
  ख: 'kh',
  ग: 'g',
  घ: 'gh',
  ङ: 'n',
  च: 'ch',
  छ: 'chh',
  ज: 'j',
  झ: 'jh',
  ञ: 'n',
  ट: 't',
  ठ: 'th',
  ड: 'd',
  ढ: 'dh',
  ण: 'n',
  त: 't',
  थ: 'th',
  द: 'd',
  ध: 'dh',
  न: 'n',
  प: 'p',
  फ: 'ph',
  ब: 'b',
  भ: 'bh',
  म: 'm',
  य: 'y',
  र: 'r',
  ल: 'l',
  व: 'v',
  श: 'sh',
  ष: 'sh',
  स: 's',
  ह: 'h',
  क़: 'q',
  ख़: 'kh',
  ग़: 'g',
  ज़: 'z',
  ड़: 'r',
  ढ़: 'rh',
  फ़: 'f',
  य़: 'y',
};

const VOWELS: Record<string, string> = {
  अ: 'a',
  आ: 'aa',
  इ: 'i',
  ई: 'ii',
  उ: 'u',
  ऊ: 'uu',
  ऋ: 'ri',
  ए: 'e',
  ऐ: 'ai',
  ओ: 'o',
  औ: 'au',
  ऑ: 'o',
  ऍ: 'e',
};

const MATRAS: Record<string, string> = {
  'ा': 'aa',
  'ि': 'i',
  'ी': 'ii',
  'ु': 'u',
  'ू': 'uu',
  'ृ': 'ri',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
  'ॉ': 'o',
  'ॅ': 'e',
};

const NUKTA = '़';
const VIRAMA = '्';
const NASAL: Record<string, string> = { 'ं': 'n', 'ँ': 'n', 'ः': 'h' };

/**
 * Devanagari to plain Latin letters, with the inherent "a" after a consonant
 * that has no vowel sign. Exact vowels hardly matter: skeleton() drops them.
 * Text that is not Devanagari passes through.
 */
export function transliterate(text: string): string {
  const chars = Array.from(text.normalize('NFC'));
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i] ?? '';
    if (chars[i + 1] === NUKTA && CONSONANTS[ch + NUKTA]) {
      ch += NUKTA;
      i += 1;
    }
    const consonant = CONSONANTS[ch];
    if (consonant) {
      out += consonant;
      const next = chars[i + 1];
      if (next === VIRAMA) i += 1;
      else if (!(next && MATRAS[next])) out += 'a';
      continue;
    }
    if (ch >= '०' && ch <= '९') {
      out += String(ch.charCodeAt(0) - '०'.charCodeAt(0));
      continue;
    }
    out += VOWELS[ch] ?? MATRAS[ch] ?? NASAL[ch] ?? (ch === NUKTA || ch === VIRAMA ? '' : ch);
  }
  return out;
}

/** Names of the letters as they are spoken, for acronyms such as MCB ("em si bi"). */
const LETTER_NAMES: Record<string, string> = {
  a: 'e',
  b: 'bi',
  c: 'si',
  d: 'di',
  e: 'i',
  f: 'ef',
  g: 'ji',
  h: 'ech',
  i: 'ai',
  j: 'je',
  k: 'ke',
  l: 'el',
  m: 'em',
  n: 'en',
  o: 'o',
  p: 'pi',
  q: 'kyu',
  r: 'ar',
  s: 'es',
  t: 'ti',
  u: 'yu',
  v: 'vi',
  w: 'dablyu',
  x: 'eks',
  y: 'vai',
  z: 'jed',
};

/** A glossary acronym such as MCB, DB or RCCB, said letter by letter. */
export function isAcronym(word: string): boolean {
  return /^[A-Z]{2,5}$/.test(word);
}

export function spellOut(acronym: string): string {
  return Array.from(acronym.toLowerCase(), (ch) => LETTER_NAMES[ch] ?? ch).join('');
}

/** Lowercase Latin words of a text, in any script. */
export function words(text: string): string[] {
  return transliterate(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * The consonant skeleton of one Latin word: "earthing", "arthing" and the
 * transliterated "अर्थिंग" all give "rtng"; "conduit" and "कंड्यूट" give "kndt".
 */
export function skeleton(word: string): string {
  let w = word.toLowerCase();
  w = w
    .replace(/tch/g, 'ch')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/ch/g, 'C') // च, kept apart from the hard c below
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/z/g, 'j')
    .replace(/w/g, 'v')
    .replace(/f/g, 'p')
    // Aspiration: kh, th, dh, bh, sh and so on lose the h.
    .replace(/([bdgjklmnprstvC])h/g, '$1');
  // Keep a leading y (as in "yes"); elsewhere it is a vowel sound.
  w = w.slice(0, 1) + w.slice(1).replace(/y/g, '');
  w = w.replace(/[aeiou]/g, '');
  w = w.replace(/(.)\1+/g, '$1');
  return w.replace(/C/g, 'c');
}
