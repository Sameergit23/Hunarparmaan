/**
 * Interview questions for the pilot trade (README "Core logic": guided voice
 * questions per NOS). They live here for the Sprint 0 spike; they belong in
 * the trade pack, which needs a schema change (rule 9) and the domain mentor's
 * wording first.
 */
import type { LocalizedText } from '@hunarpramaan/contracts';

export interface Question {
  id: string;
  /** The NOS the question is about, so follow-ups can go only to NOS not yet covered. */
  nosCode: string | null;
  text: LocalizedText;
}

export const ELECTRICIAN_QUESTIONS: readonly Question[] = [
  {
    id: 'experience',
    nosCode: null,
    text: {
      hi: 'आप कितने साल से बिजली का काम कर रहे हैं? कहाँ-कहाँ काम किया है?',
      en: 'How many years have you done electrical work, and where?',
    },
  },
  {
    id: 'wiring',
    nosCode: 'DRAFT-L3-N1',
    text: {
      hi: 'घर या बिल्डिंग की वायरिंग में आप क्या-क्या करते हैं? पाइप में तार, स्विच बोर्ड, MCB?',
      en: 'What do you do in house or building wiring? Conduit, switch boards, MCBs?',
    },
  },
  {
    id: 'earthing',
    nosCode: 'DRAFT-L3-N2',
    text: {
      hi: 'क्या आपने अर्थिंग का काम किया है? कैसे करते हैं?',
      en: 'Have you done earthing work? How do you do it?',
    },
  },
  {
    id: 'testing',
    nosCode: 'DRAFT-L3-N2',
    text: {
      hi: 'मल्टीमीटर या अर्थ टेस्टर से आप क्या-क्या जाँचते हैं?',
      en: 'What do you check with a multimeter or an earth tester?',
    },
  },
  {
    id: 'safety',
    nosCode: 'DRAFT-L3-N3',
    text: {
      hi: 'काम शुरू करने से पहले सुरक्षा के लिए आप क्या करते हैं? दस्ताने, हेलमेट, मेन बंद करना?',
      en: 'What do you do for safety before you start work? Gloves, a helmet, switching off the main?',
    },
  },
];

export interface Answer {
  questionId: string;
  /** What Vosk heard, or empty when the answer was typed. */
  asr: string;
  /** What the worker confirmed or corrected (FR-02). */
  confirmed: string;
  typed: boolean;
}

/**
 * One declaration for the whole interview: the answers in question order, so
 * the server's full mapping sees the same text the phone matched.
 */
export function declarationText(answers: readonly Answer[]): {
  asrTranscript: string;
  transcript: string;
  source: 'vosk' | 'typed';
} {
  const asrTranscript = answers
    .map((a) => a.asr.trim())
    .filter(Boolean)
    .join('\n');
  const transcript = answers
    .map((a) => a.confirmed.trim())
    .filter(Boolean)
    .join('\n');
  // `vosk` once any answer came from speech; asrTranscript keeps exactly what it heard.
  const source = answers.some((a) => !a.typed) ? 'vosk' : 'typed';
  return { asrTranscript, transcript, source };
}
