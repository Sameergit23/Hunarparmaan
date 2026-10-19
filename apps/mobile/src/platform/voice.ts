/**
 * Reading aloud (NFR-05): the consent notice and the interview questions are
 * spoken with Android's own text-to-speech, which works offline once the
 * phone has the Hindi voice installed.
 */
import * as Speech from 'expo-speech';
import type { Language } from '@hunarpramaan/contracts';

const LOCALE: Record<Language, string> = { hi: 'hi-IN', en: 'en-IN' };

/** Whether the phone has a voice for the language; without one, a person reads the text out. */
export async function hasVoice(language: Language): Promise<boolean> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const prefix = language.toLowerCase();
    return voices.some((v) => v.language.toLowerCase().replace('_', '-').startsWith(prefix));
  } catch {
    return false;
  }
}

/** Speak `text`; `onDone` runs only when it was read to the end. */
export function speak(
  text: string,
  language: Language,
  callbacks: { onDone?: () => void; onEnd?: () => void } = {},
): void {
  void Speech.stop();
  Speech.speak(text, {
    language: LOCALE[language],
    rate: 0.9,
    onDone: () => {
      callbacks.onDone?.();
      callbacks.onEnd?.();
    },
    onStopped: () => callbacks.onEnd?.(),
    onError: () => callbacks.onEnd?.(),
  });
}

export function stopSpeaking(): void {
  void Speech.stop();
}
