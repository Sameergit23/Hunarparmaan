/**
 * Offline Hindi speech to text with Vosk (vosk-model-small-hi-0.22), on the
 * phone. Audio is never stored or sent anywhere: only the words it heard are
 * kept, and the person confirms them (FR-02).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Vosk from 'react-native-vosk';
import voskModel from '../../scripts/vosk-model.json';

export type RecognizerStatus =
  | 'loading'
  | 'ready'
  | 'listening'
  /** The build has no model: run the download script, then rebuild. */
  | 'no_model'
  | 'denied'
  | 'error';

export interface ListenOptions {
  /** W4: up to 60 seconds for an interview answer; less for a form field. */
  maxSeconds?: number;
  /** A Vosk word list (packages/voice grammars), far more reliable than free speech for digits or yes. */
  grammar?: string[];
  /** Stop at the first pause, for one short answer such as a name or a number. */
  untilPause?: boolean;
  /** Called once when listening ends, with everything heard. */
  onHeard?: (text: string) => void;
}

let modelLoad: Promise<void> | null = null;

function loadModel(): Promise<void> {
  // The first load copies the model out of the app's assets, which takes a few seconds.
  modelLoad ??= Vosk.loadModel(voskModel.dir).then(() => undefined);
  return modelLoad;
}

/** Free the model's memory (about 80 MB) when a screen is done with it; the 3 GB phone needs it. */
function unloadModel(): void {
  if (!modelLoad) return;
  modelLoad = null;
  try {
    Vosk.unload();
  } catch {
    // Nothing loaded.
  }
}

export interface Recognizer {
  status: RecognizerStatus;
  /** Words heard so far in the current answer. */
  heard: string;
  /** The words being heard right now, which may still change. */
  partial: string;
  listen: (options?: ListenOptions) => Promise<void>;
  stop: () => void;
}

/** Tap to talk: listens until stopped, a pause (if asked) or the time limit. */
export function useRecognizer(): Recognizer {
  const [status, setStatus] = useState<RecognizerStatus>('loading');
  const [heard, setHeard] = useState('');
  const [partial, setPartial] = useState('');
  const segments = useRef<string[]>([]);
  const live = useRef('');
  const options = useRef<ListenOptions>({});
  const listening = useRef(false);
  const finishRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let mounted = true;
    const keep = (text: string) => {
      if (!listening.current) return;
      const words = text.replace(/\[unk\]/g, ' ').trim();
      if (words) segments.current.push(words);
      live.current = '';
      setHeard(segments.current.join(' '));
      setPartial('');
    };
    const finish = () => {
      if (!listening.current) return;
      if (live.current.trim()) keep(live.current);
      listening.current = false;
      setStatus('ready');
      options.current.onHeard?.(segments.current.join(' '));
    };
    finishRef.current = finish;
    loadModel().then(
      () => mounted && setStatus('ready'),
      () => mounted && setStatus('no_model'),
    );
    const subscriptions = [
      Vosk.onPartialResult((text) => {
        live.current = text;
        setPartial(text);
      }),
      Vosk.onResult((text) => {
        keep(text);
        if (options.current.untilPause) stopAndFinish(finish);
      }),
      Vosk.onFinalResult((text) => {
        keep(text);
        finish();
      }),
      // On timeout Vosk stops without a final result, so keep what was being heard.
      Vosk.onTimeout(() => {
        keep(live.current);
        finish();
      }),
      Vosk.onError(() => {
        listening.current = false;
        setStatus('error');
      }),
    ];
    return () => {
      mounted = false;
      listening.current = false;
      subscriptions.forEach((s) => s.remove());
      try {
        Vosk.stop();
      } catch {
        // Not listening.
      }
      unloadModel();
    };
  }, []);

  const listen = useCallback(async (next: ListenOptions = {}) => {
    options.current = next;
    segments.current = [];
    live.current = '';
    setHeard('');
    setPartial('');
    try {
      await loadModel();
      await Vosk.start({
        timeout: (next.maxSeconds ?? 60) * 1000,
        ...(next.grammar ? { grammar: next.grammar } : {}),
      });
      listening.current = true;
      setStatus('listening');
    } catch (error) {
      setStatus(/permission/i.test(String(error)) ? 'denied' : 'error');
    }
  }, []);

  const stop = useCallback(() => stopAndFinish(finishRef.current), []);

  return { status, heard, partial, listen, stop };
}

/**
 * react-native-vosk's stop() closes the recognizer at once and sends a final
 * result only when it has words, so finish after a short wait either way.
 */
const FINAL_RESULT_GRACE_MS = 400;

function stopAndFinish(finish?: () => void): void {
  try {
    Vosk.stop();
  } catch {
    // Not listening.
  }
  if (finish) setTimeout(finish, FINAL_RESULT_GRACE_MS);
}
