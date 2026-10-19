/**
 * The mobiliser registers the worker (`worker.registered`) before consent.
 * Every field can be typed, or filled by the voice assistant, which asks for
 * each field, reads the form back and saves it only after "हाँ".
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Mic, MicOff, UserPlus } from 'lucide-react-native';
import { Phone, type Language } from '@hunarpramaan/contracts';
import { digitGrammar, yesNoGrammar } from '@hunarpramaan/voice';
import { MicButton } from '../components/MicButton';
import { SyncLine } from '../components/SyncLine';
import { Body, Button, Card, ErrorNote, Field, Header, Label, Screen } from '../components/wire';
import {
  hearForm,
  startVoiceForm,
  type VoiceFormState,
  type VoiceFormStep,
  type WorkerForm,
} from '../core/voice-form';
import { fill, useI18n, type Messages } from '../i18n';
import { useRecognizer, type ListenOptions } from '../platform/speech';
import { speak, stopSpeaking } from '../platform/voice';
import { useServices } from '../services';
import { border, color, font, radius, size } from '../theme';

const LANGUAGE_GRAMMAR = ['हिंदी', 'हिन्दी', 'इंग्लिश', 'अंग्रेज़ी', 'अंग्रेजी', 'पीछे', '[unk]'];

function listenFor(step: VoiceFormStep): ListenOptions {
  if (step === 'phone') return { grammar: digitGrammar(), untilPause: true, maxSeconds: 20 };
  if (step === 'language') return { grammar: LANGUAGE_GRAMMAR, untilPause: true, maxSeconds: 10 };
  if (step === 'confirm') return { grammar: yesNoGrammar(), untilPause: true, maxSeconds: 10 };
  return { untilPause: true, maxSeconds: 10 };
}

function promptFor(state: VoiceFormState, m: Messages): string {
  const problem = state.problem
    ? fill(m.register.problem[state.problem], { missing: state.missing })
    : '';
  if (state.problem && state.step !== 'confirm') return problem;
  const { form } = state;
  const ask =
    state.step === 'confirm'
      ? fill(m.register.ask.confirm, {
          name: form.name,
          // One digit at a time, in two groups of five.
          phone: `${[...form.phone.slice(0, 5)].join(' ')}, ${[...form.phone.slice(5)].join(' ')}`,
          language: form.language ? m.register.languageName[form.language] : '',
        })
      : state.step === 'done'
        ? ''
        : m.register.ask[state.step];
  return [problem, ask].filter(Boolean).join(' ');
}

export function RegisterWorkerScreen({
  onBack,
  onRegistered,
}: {
  onBack: () => void;
  onRegistered: (workerId: string, language: Language) => void;
}) {
  const { lang, m } = useI18n();
  const { record, newEntityId, sync } = useServices();
  const recognizer = useRecognizer();
  const [form, setForm] = useState<WorkerForm>({ name: '', phone: '', language: null });
  const [assistant, setAssistant] = useState<VoiceFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(
    () => () => {
      running.current = false;
      stopSpeaking();
    },
    [],
  );

  const save = (values: WorkerForm) => {
    setError(null);
    const name = values.name.trim();
    if (!name) return setError(m.register.nameRequired);
    if (!Phone.safeParse(values.phone).success) return setError(m.register.badPhone);
    if (!values.language) return setError(m.register.languageRequired);
    try {
      const workerId = newEntityId();
      record('worker.registered', {
        workerId,
        name,
        phone: values.phone,
        language: values.language,
      });
      onRegistered(workerId, values.language);
    } catch {
      setError(m.error.save);
    }
  };

  const stopAssistant = () => {
    running.current = false;
    stopSpeaking();
    recognizer.stop();
    setAssistant(null);
  };

  const runStep = (state: VoiceFormState) => {
    if (!running.current) return;
    setAssistant(state);
    setForm(state.form);
    if (state.step === 'done') {
      running.current = false;
      setAssistant(null);
      save(state.form);
      return;
    }
    speak(promptFor(state, m), lang, {
      onEnd: () => {
        if (!running.current) return;
        void recognizer.listen({
          ...listenFor(state.step),
          onHeard: (text) => runStep(hearForm(state, text)),
        });
      },
    });
  };

  const startAssistant = () => {
    setError(null);
    running.current = true;
    runStep(startVoiceForm(form));
  };

  const voiceUnavailable = ['no_model', 'denied', 'error'].includes(recognizer.status);

  return (
    <Screen
      footer={
        <Button
          label={m.register.submit}
          icon={UserPlus}
          onPress={() => save(form)}
          disabled={assistant !== null}
        />
      }
    >
      <Header title={m.register.title} onBack={onBack} backLabel={m.back} />
      <SyncLine onRetry={sync.nudge} />
      <Card>
        <Body size={15}>{m.register.voiceHint}</Body>
        {assistant ? (
          <>
            <Text style={styles.prompt}>{promptFor(assistant, m)}</Text>
            <MicButton
              listening={recognizer.status === 'listening'}
              label={
                recognizer.status === 'listening' ? m.interview.listening : m.register.voiceStop
              }
              onPress={stopAssistant}
            />
            {recognizer.partial ? <Body>{recognizer.partial}</Body> : null}
            <Button
              label={m.register.voiceStop}
              icon={MicOff}
              variant="secondary"
              onPress={stopAssistant}
            />
          </>
        ) : (
          <Button
            label={m.register.voice}
            icon={Mic}
            variant="secondary"
            onPress={startAssistant}
            disabled={voiceUnavailable || recognizer.status === 'loading'}
            busy={recognizer.status === 'loading'}
          />
        )}
        {recognizer.status === 'no_model' ? <ErrorNote>{m.interview.noModel}</ErrorNote> : null}
        {recognizer.status === 'denied' ? <ErrorNote>{m.interview.micDenied}</ErrorNote> : null}
      </Card>
      <Field
        label={m.register.name}
        value={form.name}
        onChangeText={(name) => setForm((f) => ({ ...f, name }))}
        autoCapitalize="words"
        editable={assistant === null}
      />
      <Field
        label={m.register.phone}
        value={form.phone}
        onChangeText={(phone) => setForm((f) => ({ ...f, phone: phone.replace(/\D/g, '') }))}
        keyboardType="number-pad"
        maxLength={10}
        editable={assistant === null}
      />
      <Label>{m.register.language}</Label>
      <View style={styles.choices}>
        {(['hi', 'en'] as const).map((language) => {
          const selected = form.language === language;
          return (
            <Pressable
              key={language}
              onPress={() => setForm((f) => ({ ...f, language }))}
              disabled={assistant !== null}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {language === 'hi' ? m.register.hindi : m.register.english}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  prompt: { fontFamily: font.bodySemiBold, fontSize: 20, lineHeight: 30, color: color.ink },
  choices: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1,
    minHeight: size.workerButton,
    borderRadius: radius.button,
    borderWidth: border.quiet.width,
    borderColor: border.quiet.color,
    backgroundColor: color.plate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A person's choice is black (Wire code).
  choiceSelected: {
    backgroundColor: color.ink,
    borderWidth: border.strong.width,
    borderColor: color.ink,
  },
  choiceText: { fontFamily: font.bodySemiBold, fontSize: 18, color: color.ink },
  choiceTextSelected: { color: color.plate },
});
