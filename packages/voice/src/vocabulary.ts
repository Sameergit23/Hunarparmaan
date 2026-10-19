/**
 * The words sign-in screens listen for (workflows.md section 5.3), spelled as people and
 * recognisers write them. Lookups compare `wordKey` forms, so a nukta, chandrabindu or case
 * difference needs no extra entry; the spellings listed here also go into the word lists the
 * recogniser listens for (`grammar.ts`).
 *
 * Each list has Hindi, then English as a Hindi recogniser writes it (नाइन), then Hinglish and
 * English.
 */

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type Command = 'repeat' | 'back' | 'next' | 'help' | 'stop' | 'delete';

export const DIGIT_WORDS: Readonly<Record<Digit, readonly string[]>> = {
  0: ['शून्य', 'शुन्य', 'ज़ीरो', 'जीरो', 'shunya', 'shoonya', 'zero'],
  1: ['एक', 'वन', 'ek', 'one'],
  2: ['दो', 'टू', 'do', 'two'],
  3: ['तीन', 'थ्री', 'teen', 'three'],
  4: ['चार', 'फ़ोर', 'फोर', 'char', 'chaar', 'four'],
  5: ['पाँच', 'पांच', 'फ़ाइव', 'फाइव', 'paanch', 'panch', 'five'],
  6: ['छह', 'छः', 'छे', 'छ', 'सिक्स', 'chhah', 'chhe', 'six'],
  7: ['सात', 'सेवन', 'saat', 'seven'],
  8: ['आठ', 'एट', 'aath', 'eight'],
  9: ['नौ', 'नाइन', 'nau', 'nine'],
};

/** Hindi words for 10 to 99, for people who say a number in pairs: "अट्ठानवे छिहत्तर" is 9876. */
export const PAIR_WORDS: Readonly<Record<string, readonly string[]>> = {
  10: ['दस'],
  11: ['ग्यारह'],
  12: ['बारह'],
  13: ['तेरह'],
  14: ['चौदह'],
  15: ['पंद्रह', 'पन्द्रह'],
  16: ['सोलह'],
  17: ['सत्रह', 'सत्तरह'],
  18: ['अठारह', 'अट्ठारह'],
  19: ['उन्नीस'],
  20: ['बीस'],
  21: ['इक्कीस'],
  22: ['बाईस'],
  23: ['तेईस'],
  24: ['चौबीस'],
  25: ['पच्चीस'],
  26: ['छब्बीस'],
  27: ['सत्ताईस', 'सताईस'],
  28: ['अट्ठाईस', 'अठाईस'],
  29: ['उनतीस', 'उन्तीस'],
  30: ['तीस'],
  31: ['इकतीस', 'इकत्तीस'],
  32: ['बत्तीस'],
  33: ['तैंतीस', 'तेंतीस', 'तैतीस'],
  34: ['चौंतीस', 'चौतीस'],
  35: ['पैंतीस', 'पैतीस'],
  36: ['छत्तीस'],
  37: ['सैंतीस', 'सैतीस'],
  38: ['अड़तीस'],
  39: ['उनतालीस', 'उन्तालीस'],
  40: ['चालीस'],
  41: ['इकतालीस'],
  42: ['बयालीस', 'बियालीस'],
  43: ['तैंतालीस', 'तेंतालीस', 'तैतालीस'],
  44: ['चौवालीस', 'चवालीस'],
  45: ['पैंतालीस', 'पैतालीस'],
  46: ['छियालीस', 'छयालीस'],
  47: ['सैंतालीस', 'सैतालीस'],
  48: ['अड़तालीस'],
  49: ['उनचास', 'उन्चास'],
  50: ['पचास'],
  51: ['इक्यावन'],
  52: ['बावन'],
  53: ['तिरेपन', 'तिरपन'],
  54: ['चौवन', 'चव्वन'],
  55: ['पचपन'],
  56: ['छप्पन'],
  57: ['सत्तावन', 'सतावन'],
  58: ['अट्ठावन', 'अठावन'],
  59: ['उनसठ', 'उन्सठ'],
  60: ['साठ'],
  61: ['इकसठ'],
  62: ['बासठ'],
  63: ['तिरेसठ', 'तिरसठ'],
  64: ['चौंसठ', 'चौसठ'],
  65: ['पैंसठ', 'पैसठ'],
  66: ['छियासठ'],
  67: ['सड़सठ', 'सरसठ'],
  68: ['अड़सठ'],
  69: ['उनहत्तर'],
  70: ['सत्तर'],
  71: ['इकहत्तर'],
  72: ['बहत्तर'],
  73: ['तिहत्तर'],
  74: ['चौहत्तर'],
  75: ['पचहत्तर'],
  76: ['छिहत्तर'],
  77: ['सतहत्तर'],
  78: ['अठहत्तर'],
  79: ['उन्यासी', 'उनासी'],
  80: ['अस्सी'],
  81: ['इक्यासी'],
  82: ['बयासी'],
  83: ['तिरासी'],
  84: ['चौरासी'],
  85: ['पचासी'],
  86: ['छियासी'],
  87: ['सत्तासी'],
  88: ['अट्ठासी'],
  89: ['नवासी', 'नव्वासी'],
  90: ['नब्बे'],
  91: ['इक्यानवे', 'इक्यानबे'],
  92: ['बानवे', 'बानबे'],
  93: ['तिरानवे', 'तिरानबे'],
  94: ['चौरानवे', 'चौरानबे'],
  95: ['पंचानवे', 'पंचानबे', 'पचानवे'],
  96: ['छियानवे', 'छियानबे'],
  97: ['सत्तानवे', 'सत्तानबे'],
  98: ['अट्ठानवे', 'अट्ठानबे'],
  99: ['निन्यानवे', 'निन्यानबे'],
};

/** Says the next number twice or three times: "डबल सात" is 77. */
export const REPEAT_WORDS: Readonly<Record<2 | 3, readonly string[]>> = {
  2: ['डबल', 'double'],
  3: ['ट्रिपल', 'triple'],
};

/** "प्लस नाइन वन" is +91. */
export const PLUS_WORDS: readonly string[] = ['प्लस', 'plus'];

/**
 * Words for a hundred and more. A phone number is said digit by digit, so these are never used;
 * they are listened for so that "नौ सौ" comes back as a word to explain ("एक-एक अंक बोलें")
 * instead of being misheard as a digit.
 */
export const SCALE_WORDS: readonly string[] = [
  'सौ',
  'हज़ार',
  'हजार',
  'लाख',
  'करोड़',
  'hundred',
  'thousand',
  'lakh',
  'crore',
];

export const YES_WORDS: readonly string[] = ['हाँ', 'हां', 'यस', 'haan', 'yes'];

/** Yes on their own, but "जी नहीं" and "सही नहीं है" are no. */
export const SOFT_YES_WORDS: readonly string[] = ['जी', 'सही', 'ji', 'sahi'];

export const NO_WORDS: readonly string[] = [
  'नहीं',
  'नही',
  'नो',
  'गलत',
  'ग़लत',
  'nahin',
  'nahi',
  'no',
  'galat',
];

/** Phrases to listen for on yes-or-no screens, besides the single words. */
export const YES_NO_PHRASES: readonly string[] = ['सही है', 'sahi hai'];

export const COMMAND_WORDS: Readonly<Record<Command, readonly string[]>> = {
  repeat: ['दोबारा', 'दुबारा', 'फिर से', 'रिपीट', 'dobara', 'dubara', 'phir se', 'repeat'],
  back: ['पीछे', 'बैक', 'peechhe', 'peeche', 'piche', 'back'],
  next: ['आगे', 'नेक्स्ट', 'aage', 'next'],
  help: ['मदद', 'हेल्प', 'madad', 'help'],
  stop: ['रुको', 'रुकिए', 'स्टॉप', 'ruko', 'stop'],
  delete: ['मिटाओ', 'मिटाएँ', 'मिटाएं', 'डिलीट', 'mitao', 'delete'],
};
