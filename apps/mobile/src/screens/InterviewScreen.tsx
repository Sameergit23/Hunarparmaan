/**
 * W4. Apna Anubhav interview (FR-01, FR-02; reference: docs/design/screens/interview.html).
 * Each question plays by itself; the worker taps the mic and speaks, Vosk
 * writes it down on the phone, and the worker confirms or corrects it. At the
 * end the phone saves `declaration.recorded` (both what Vosk heard and what the
 * worker confirmed) and the device mapper's provisional `mapping.suggested`.
 *
 * Not built yet: the picture cards of the reference, and "finish later" (W4).
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Keyboard, Pencil, Save, Volume2, X } from 'lucide-react-native';
import type { Actor, Language } from '@hunarpramaan/contracts';
import { mappingPayload, suggestMapping, type MappingSuggestion } from '@hunarpramaan/mapping';
import { MicButton } from '../components/MicButton';
import {
  Body,
  Button,
  Card,
  ErrorNote,
  Field,
  Header,
  Icon,
  Label,
  Screen,
} from '../components/wire';
import { declarationText, ELECTRICIAN_QUESTIONS, type Answer } from '../core/questions';
import { fill, useI18n } from '../i18n';
import { useRecognizer } from '../platform/speech';
import { hasVoice, speak, stopSpeaking } from '../platform/voice';
import { useServices } from '../services';
import { border, color, font, radius, size } from '../theme';

/** Rule 1: the keyword match is the device mapper's suggestion, never the mobiliser's decision. */
const DEVICE_MAPPER: Actor = { kind: 'system', service: 'device-mapper' };

type Mode = 'ask' | 'heard' | 'correct' | 'type';

export function InterviewScreen({
  workerId,
  language,
  onBack,
  onDone,
}: {
  workerId: string;
  language: Language;
  onBack: () => void;
  onDone: (result: { declarationId: string; suggestion: MappingSuggestion | null }) => void;
}) {
  const { m } = useI18n();
  const { record, newEntityId, pack } = useServices();
  const recognizer = useRecognizer();
  const questions = ELECTRICIAN_QUESTIONS;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [mode, setMode] = useState<Mode>('ask');
  const [heard, setHeard] = useState('');
  const [edit, setEdit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState(false);
  const question = questions[index] ?? questions[0];
  const listening = recognizer.status === 'listening';
  const micUnavailable = ['no_model', 'denied', 'error'].includes(recognizer.status);

  useEffect(() => {
    void hasVoice(language).then(setVoice);
    return stopSpeaking;
  }, [language]);

  // W4: each question plays by itself.
  useEffect(() => {
    if (voice) speak(question.text[language], language);
  }, [voice, question, language]);

  const answered = useMemo(() => Object.keys(answers).length, [answers]);

  const goTo = (next: number) => {
    stopSpeaking();
    setError(null);
    setMode('ask');
    setHeard('');
    setEdit('');
    setIndex(next);
  };

  const finish = (all: Record<string, Answer>) => {
    const ordered = questions.flatMap((q) => all[q.id] ?? []);
    if (ordered.length === 0) {
      setError(m.interview.noAnswers);
      return;
    }
    const text = declarationText(ordered);
    const declarationId = newEntityId();
    try {
      record('declaration.recorded', { declarationId, workerId, language, ...text });
    } catch {
      setError(m.error.save);
      return;
    }
    // The declaration is saved; if the match fails, the server's full mapping still runs after sync.
    onDone({ declarationId, suggestion: suggestAndRecord(declarationId, text.transcript) });
  };

  const suggestAndRecord = (declarationId: string, transcript: string) => {
    try {
      const suggestion = suggestMapping(pack, transcript);
      record('mapping.suggested', mappingPayload(declarationId, suggestion), {
        actor: DEVICE_MAPPER,
      });
      return suggestion;
    } catch {
      return null;
    }
  };

  const keep = (answer: Answer | null) => {
    const next = Object.fromEntries(Object.entries(answers).filter(([id]) => id !== question.id));
    if (answer) next[question.id] = answer;
    setAnswers(next);
    if (index < questions.length - 1) goTo(index + 1);
    else finish(next);
  };

  const toggleMic = () => {
    setError(null);
    if (listening) {
      recognizer.stop();
      return;
    }
    stopSpeaking();
    setMode('ask');
    void recognizer.listen({
      maxSeconds: 60,
      onHeard: (text) => {
        if (!text.trim()) {
          setError(m.interview.heardNothing);
          return;
        }
        setHeard(text);
        setMode('heard');
      },
    });
  };

  const saveEdit = () => {
    if (!edit.trim()) {
      setError(m.correct.empty);
      return;
    }
    keep(
      mode === 'type'
        ? { questionId: question.id, asr: '', confirmed: edit, typed: true }
        : { questionId: question.id, asr: heard, confirmed: edit, typed: false },
    );
  };

  return (
    <Screen>
      <Header
        title={m.interview.title}
        onBack={() => (index > 0 ? goTo(index - 1) : onBack())}
        backLabel={m.back}
        right={
          <Text style={styles.progressText}>
            {fill(m.interview.progress, { n: index + 1, total: questions.length })}
          </Text>
        }
      />
      <View style={styles.progress} accessibilityElementsHidden>
        {questions.map((q, i) => (
          <View
            key={q.id}
            style={[styles.segment, i <= index ? styles.segmentOn : styles.segmentOff]}
          />
        ))}
      </View>

      <Card strong>
        <View style={styles.questionRow}>
          <Pressable
            onPress={() => speak(question.text[language], language)}
            disabled={!voice}
            accessibilityRole="button"
            accessibilityLabel={m.interview.listen}
            style={[styles.listen, !voice && { opacity: 0.5 }]}
          >
            <Icon icon={Volume2} size={26} tint={color.plate} />
          </Pressable>
          <Text style={styles.question}>{question.text[language]}</Text>
        </View>
      </Card>

      {mode === 'correct' || mode === 'type' ? (
        <>
          {mode === 'correct' ? (
            <Card>
              <Label>{m.correct.heard}</Label>
              <Body>{heard}</Body>
            </Card>
          ) : null}
          <Field
            label={mode === 'correct' ? m.correct.hint : m.interview.typeInstead}
            value={edit}
            onChangeText={setEdit}
            multiline
            autoFocus
          />
          <Button label={m.correct.save} icon={Save} onPress={saveEdit} />
        </>
      ) : (
        <>
          <MicButton
            listening={listening}
            busy={recognizer.status === 'loading'}
            disabled={micUnavailable}
            label={listening ? m.interview.listening : m.interview.tapToSpeak}
            onPress={toggleMic}
          />
          {recognizer.status === 'loading' ? <Body size={15}>{m.interview.preparing}</Body> : null}

          {listening || mode === 'heard' ? (
            <Card>
              <Label>{m.interview.youSaid}</Label>
              <Text style={styles.heard}>
                {mode === 'heard'
                  ? heard
                  : [recognizer.heard, recognizer.partial].filter(Boolean).join(' ')}
              </Text>
              {mode === 'heard' ? (
                <View style={styles.pair}>
                  <View style={styles.half}>
                    <Button
                      label={m.interview.confirm}
                      icon={Check}
                      onPress={() =>
                        keep({
                          questionId: question.id,
                          asr: heard,
                          confirmed: heard,
                          typed: false,
                        })
                      }
                    />
                  </View>
                  <View style={styles.half}>
                    <Button
                      label={m.interview.change}
                      icon={Pencil}
                      variant="secondary"
                      onPress={() => {
                        setEdit(heard);
                        setMode('correct');
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          ) : null}

          {recognizer.status === 'no_model' ? <ErrorNote>{m.interview.noModel}</ErrorNote> : null}
          {recognizer.status === 'denied' ? <ErrorNote>{m.interview.micDenied}</ErrorNote> : null}
          {!listening ? (
            <View style={styles.pair}>
              <View style={styles.half}>
                <Button
                  label={m.interview.notDone}
                  icon={X}
                  variant="secondary"
                  onPress={() => keep(null)}
                />
              </View>
              <View style={styles.half}>
                <Button
                  label={m.interview.typeInstead}
                  icon={Keyboard}
                  variant="secondary"
                  onPress={() => {
                    setEdit('');
                    setMode('type');
                  }}
                />
              </View>
            </View>
          ) : null}
        </>
      )}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {index === questions.length - 1 && answered > 0 && mode === 'ask' && !listening ? (
        <Button
          label={m.interview.finish}
          icon={Save}
          variant="secondary"
          onPress={() => finish(answers)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressText: { fontFamily: font.bodySemiBold, fontSize: 16, color: color.ink },
  progress: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 10, borderRadius: 5 },
  segmentOn: { backgroundColor: color.ink },
  segmentOff: { borderWidth: 2, borderStyle: 'dashed', borderColor: color.line },
  questionRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  listen: {
    width: 52,
    height: 52,
    borderRadius: radius.button,
    borderWidth: border.strong.width,
    borderColor: border.strong.color,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  question: {
    flex: 1,
    fontFamily: font.bodySemiBold,
    fontSize: 21,
    lineHeight: 30,
    color: color.ink,
  },
  heard: {
    fontFamily: font.body,
    fontSize: 18,
    lineHeight: 27,
    color: color.ink,
    minHeight: size.touchMin,
  },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
