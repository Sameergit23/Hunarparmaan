/**
 * W2. Consent, before anything is recorded. The notice plays aloud by itself
 * in the worker's language (NFR-05), with the text on screen. `readAloud` is
 * true only when the phone read the whole notice. The worker gives consent
 * themselves; nothing is stored on "No".
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, Square, Volume2, X } from 'lucide-react-native';
import type { Language } from '@hunarpramaan/contracts';
import { LanguageToggle } from '../components/LanguageToggle';
import { Body, Button, Card, ErrorNote, Header, Screen } from '../components/wire';
import { CONSENT_NOTICE_VERSION } from '../core/consent';
import { dictionaries, useI18n } from '../i18n';
import { hasVoice, speak, stopSpeaking } from '../platform/voice';
import { useServices } from '../services';
import { color, font } from '../theme';

export function ConsentScreen({
  workerId,
  language,
  onAgreed,
  onDeclined,
}: {
  workerId: string;
  language: Language;
  onAgreed: () => void;
  onDeclined: () => void;
}) {
  const { m } = useI18n();
  const { record, newEntityId } = useServices();
  // The notice is in the worker's language, whatever the screen's language.
  const notice = dictionaries[language].consent.notice;
  const [voice, setVoice] = useState<boolean | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const play = () => {
    setSpeaking(true);
    speak(notice, language, {
      onDone: () => setReadAloud(true),
      onEnd: () => setSpeaking(false),
    });
  };

  useEffect(() => {
    let mounted = true;
    void hasVoice(language).then((available) => {
      if (!mounted) return;
      setVoice(available);
      if (available) play();
    });
    return () => {
      mounted = false;
      stopSpeaking();
    };
    // Play once, when the screen opens.
  }, []);

  const agree = () => {
    stopSpeaking();
    try {
      record('consent.given', {
        consentId: newEntityId(),
        workerId,
        noticeVersion: CONSENT_NOTICE_VERSION,
        language,
        readAloud,
      });
      onAgreed();
    } catch {
      setError(m.error.save);
    }
  };

  const decline = () => {
    stopSpeaking();
    setDeclined(true);
    speak(dictionaries[language].consent.declined, language);
    setTimeout(onDeclined, 2500);
  };

  return (
    <Screen
      footer={
        declined ? null : (
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label={m.consent.decline} icon={X} variant="secondary" onPress={decline} />
            </View>
            <View style={styles.actionWide}>
              <Button label={m.consent.agree} icon={Check} onPress={agree} />
            </View>
          </View>
        )
      }
    >
      <Header title={m.consent.title} right={<LanguageToggle />} />
      <Card strong>
        <Text style={styles.notice}>{notice}</Text>
      </Card>
      {voice ? (
        <Button
          label={speaking ? m.consent.pause : m.consent.listenAgain}
          icon={speaking ? Square : Volume2}
          variant="secondary"
          onPress={speaking ? stopSpeaking : play}
        />
      ) : null}
      {voice === false ? <ErrorNote>{m.consent.noVoice}</ErrorNote> : null}
      <Body size={15}>{m.consent.workerDecides}</Body>
      {declined ? <Body>{m.consent.declined}</Body> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { fontFamily: font.body, fontSize: 18, lineHeight: 28, color: color.ink },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  actionWide: { flex: 2 },
});
