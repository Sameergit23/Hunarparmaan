/**
 * Offline Hindi speech to text with Vosk (vosk-model-small-hi-0.22), on the
 * phone. Audio is never stored or sent anywhere: only the words it heard are
 * kept, and the worker confirms them (FR-02).
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

let modelLoad: Promise<void> | null = null;

function loadModel(): Promise<void> {
  // The first load copies the model out of the app's assets, which takes a few seconds.
  modelLoad ??= Vosk.loadModel(voskModel.dir).then(() => undefined);
  return modelLoad;
}

/** Free the model's memory (about 80 MB) when the interview is over; the 3 GB phone needs it. */
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
  start: () => Promise<void>;
  stop: () => void;
}

/** Tap to talk: listens for up to `maxSeconds` (W4: 60 seconds), or until stopped. */
export function useRecognizer(maxSeconds = 60): Recognizer {
  const [status, setStatus] = useState<RecognizerStatus>('loading');
  const [heard, setHeard] = useState('');
  const [partial, setPartial] = useState('');
  const segments = useRef<string[]>([]);
  const live = useRef('');

  useEffect(() => {
    let mounted = true;
    const keep = (text: string) => {
      if (text.trim()) segments.current.push(text.trim());
      live.current = '';
      setHeard(segments.current.join(' '));
      setPartial('');
    };
    loadModel().then(
      () => mounted && setStatus('ready'),
      () => mounted && setStatus('no_model'),
    );
    const subscriptions = [
      Vosk.onPartialResult((text) => {
        live.current = text;
        setPartial(text);
      }),
      Vosk.onResult(keep),
      Vosk.onFinalResult((text) => {
        keep(text);
        setStatus('ready');
      }),
      // On timeout Vosk stops without a final result, so keep what was being heard.
      Vosk.onTimeout(() => {
        keep(live.current);
        setStatus('ready');
      }),
      Vosk.onError(() => setStatus('error')),
    ];
    return () => {
      mounted = false;
      subscriptions.forEach((s) => s.remove());
      try {
        Vosk.stop();
      } catch {
        // Not listening.
      }
      unloadModel();
    };
  }, []);

  const start = useCallback(async () => {
    segments.current = [];
    live.current = '';
    setHeard('');
    setPartial('');
    try {
      await loadModel();
      await Vosk.start({ timeout: maxSeconds * 1000 });
      setStatus('listening');
    } catch (error) {
      setStatus(/permission/i.test(String(error)) ? 'denied' : 'error');
    }
  }, [maxSeconds]);

  const stop = useCallback(() => {
    Vosk.stop();
  }, []);

  return { status, heard, partial, start, stop };
}
