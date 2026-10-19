/**
 * The big round mic button (W4, workflows 5.2). Listening shows the red
 * recording dot and a timer: red is only ever errors and the recording dot.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Mic, Square } from 'lucide-react-native';
import { border, color, font, role } from '../theme';
import { Icon } from './wire';

export function MicButton({
  listening,
  busy,
  disabled,
  label,
  onPress,
}: {
  listening: boolean;
  busy?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!listening) return;
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [listening]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
        style={({ pressed }) => [
          styles.button,
          (disabled || busy) && { opacity: 0.5 },
          pressed && { opacity: 0.8 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={color.plate} />
        ) : (
          <Icon icon={listening ? Square : Mic} size={34} tint={color.plate} />
        )}
      </Pressable>
      <View style={styles.caption}>
        {listening ? <View style={styles.dot} /> : null}
        <Text style={styles.label}>{listening ? `${label}  ${formatTime(seconds)}` : label}</Text>
      </View>
    </View>
  );
}

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: border.quiet.color,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: role.error },
  label: { fontFamily: font.bodySemiBold, fontSize: 17, color: color.ink },
});
