/**
 * The sync line, on every signed-in screen (workflows section 11): the pending
 * count is always visible, with colour, an icon and words together.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CircleCheck, Clock, RotateCw, TriangleAlert } from 'lucide-react-native';
import { fill, useI18n } from '../i18n';
import { useSync } from '../services';
import { border, color, font, radius, role, size } from '../theme';
import { Icon } from './wire';

export function SyncLine({ onRetry }: { onRetry: () => void }) {
  const { m } = useI18n();
  const { state, pending } = useSync();
  const count = { count: pending };

  let tone: 'done' | 'waiting' | 'failed';
  let text: string;
  if (state.kind === 'rejected') {
    tone = 'failed';
    text = m.sync.failed;
  } else if (state.kind === 'signed_out') {
    tone = 'failed';
    text = fill(m.sync.signedOut, count);
  } else if (pending === 0) {
    tone = 'done';
    text = m.sync.synced;
  } else if (state.kind === 'offline') {
    tone = 'waiting';
    text = fill(m.sync.offline, count);
  } else if (state.kind === 'sending') {
    tone = 'waiting';
    text = fill(m.sync.sending, count);
  } else {
    tone = 'waiting';
    text = fill(m.sync.waiting, count);
  }

  const background = tone === 'done' ? role.verified : color.plate;
  const foreground = tone === 'done' ? color.onGreen : color.ink;
  const icon = tone === 'done' ? CircleCheck : tone === 'failed' ? TriangleAlert : Clock;
  const iconTint = tone === 'failed' ? role.error : foreground;

  return (
    <View
      style={[
        styles.line,
        { backgroundColor: background },
        tone === 'failed' && { borderColor: role.error },
        tone === 'done' && { borderColor: role.verified },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Icon icon={icon} size={20} tint={iconTint} />
      <Text style={[styles.text, { color: foreground }]}>{text}</Text>
      {tone !== 'done' && state.kind !== 'sending' ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={m.sync.retry}
          style={styles.retry}
        >
          <Icon icon={RotateCw} size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: size.touchMin,
    paddingLeft: 12,
    borderRadius: radius.chip,
    borderWidth: border.strong.width,
    borderColor: border.strong.color,
  },
  text: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 16 },
  retry: {
    width: size.touchMin,
    height: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
