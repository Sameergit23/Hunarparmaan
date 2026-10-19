/**
 * After the interview: the answers are saved on the phone, and the keyword
 * match is shown as a yellow AI hint that the mobiliser will confirm (W5 in
 * short; rule 1 in the UI). The full match-result screen comes in Sprint 1.
 */
import { StyleSheet, Text, View } from 'react-native';
import { CircleCheck, House } from 'lucide-react-native';
import type { MappingSuggestion } from '@hunarpramaan/mapping';
import { SyncLine } from '../components/SyncLine';
import { AiHint, Body, Button, Header, Icon, Screen } from '../components/wire';
import { fill, useI18n } from '../i18n';
import { useServices } from '../services';
import { border, color, font, radius, role } from '../theme';

export function DoneScreen({
  suggestion,
  onHome,
}: {
  suggestion: MappingSuggestion | null;
  onHome: () => void;
}) {
  const { lang, m } = useI18n();
  const { pack, sync } = useServices();
  const threshold = pack.policy.routingThreshold;
  const suggested = suggestion?.results.find((r) => r.nqrCode === suggestion.suggestedNqrCode);
  const qualification = pack.qualifications.find((q) => q.nqrCode === suggested?.nqrCode);

  return (
    <Screen footer={<Button label={m.done.home} icon={House} onPress={onHome} />}>
      <Header title={m.done.title} />
      <View style={styles.saved}>
        <Icon icon={CircleCheck} tint={color.onGreen} />
        <Text style={styles.savedText}>{m.done.saved}</Text>
      </View>
      <SyncLine onRetry={sync.nudge} />
      <AiHint label={m.done.aiHint}>
        <Body size={16}>{m.done.aiOnly}</Body>
        {suggested && qualification ? (
          <View style={styles.qp}>
            <Text style={styles.qpTitle}>
              {qualification.title[lang]}, NSQF {qualification.nsqfLevel}
            </Text>
            <Text style={styles.percent}>
              {fill(m.done.coverage, { percent: Math.round(suggested.coverage * 100) })}
            </Text>
            <CoverageBar value={suggested.coverage} threshold={threshold} />
            <Body size={16}>
              {fill(m.done.matched, {
                covered: suggested.coveredCriteria.length,
                total: suggested.totalCriteria,
              })}
            </Body>
            <Text style={styles.route}>
              {suggested.route === 'direct_assessment' ? m.done.direct : m.done.bridge}
            </Text>
            {suggestion?.needsReview ? <Body size={15}>{m.done.review}</Body> : null}
          </View>
        ) : (
          <Body size={16}>{m.done.noMatch}</Body>
        )}
      </AiHint>
    </Screen>
  );
}

/** Wire code coverage bar: green fill at the threshold or more, grey below, a black tick at the threshold. */
function CoverageBar({ value, threshold }: { value: number; threshold: number }) {
  const met = value + 1e-9 >= threshold;
  return (
    <View style={styles.track} accessibilityElementsHidden>
      <View
        style={[
          styles.fill,
          {
            width: `${Math.min(100, value * 100)}%`,
            backgroundColor: met ? role.verified : color.line,
          },
        ]}
      />
      <View style={[styles.tick, { left: `${threshold * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.card,
    backgroundColor: role.verified,
  },
  savedText: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 16, color: color.onGreen },
  qp: { gap: 6, paddingTop: 4 },
  qpTitle: { fontFamily: font.headingStrip, fontSize: 20, color: color.ink },
  percent: { fontFamily: font.heading, fontSize: 32, color: color.ink },
  route: {
    alignSelf: 'flex-start',
    fontFamily: font.bodySemiBold,
    fontSize: 16,
    color: color.ink,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.chip,
    borderWidth: border.strong.width,
    borderColor: color.ink,
    backgroundColor: color.plate,
  },
  track: {
    height: 12,
    borderRadius: 6,
    backgroundColor: color.divider,
    overflow: 'visible',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 6 },
  tick: { position: 'absolute', width: 3, top: -4, bottom: -4, backgroundColor: color.ink },
});
