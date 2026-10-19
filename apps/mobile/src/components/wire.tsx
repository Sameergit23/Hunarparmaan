/**
 * Wire code components for the phone (docs/design/wire-code.md). Colours,
 * fonts and sizes come from theme.ts only.
 */
import type { ComponentType, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LucideProps } from 'lucide-react-native';
import { ArrowLeft, TriangleAlert } from 'lucide-react-native';
import { border, color, font, radius, role, size, type } from '../theme';

type IconComponent = ComponentType<LucideProps>;

/** Feather-style outlines with square caps and mitred joins, on a 24px grid. */
export function Icon({ icon: Glyph, size: px = 22, tint = color.ink, strokeWidth = 2 }: {
  icon: IconComponent;
  size?: number;
  tint?: string;
  strokeWidth?: number;
}) {
  return (
    <Glyph
      size={px}
      color={tint}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
  );
}

/** Every screen starts with three 4px bands: red, yellow and blue. */
export function BrandStripe() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {role.brandStripe.map((band) => (
        <View key={band} style={{ height: size.stripeBand, backgroundColor: band }} />
      ))}
    </View>
  );
}

export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <BrandStripe />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Header({
  title,
  onBack,
  backLabel,
  right,
}: {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Icon icon={ArrowLeft} />
        </Pressable>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  icon?: IconComponent;
  disabled?: boolean;
  busy?: boolean;
}) {
  const primary = variant === 'primary';
  const tint = primary ? color.plate : color.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tint} />
      ) : icon ? (
        <Icon icon={icon} size={20} tint={tint} strokeWidth={primary ? 2.6 : 2} />
      ) : null}
      <Text style={[styles.buttonText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <View style={[styles.card, strong ? styles.cardStrong : styles.cardQuiet]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Body({ children, size: px = type.body }: { children: ReactNode; size?: number }) {
  return <Text style={[styles.body17, { fontSize: px, lineHeight: px * 1.5 }]}>{children}</Text>;
}

export function Field({
  label,
  ...input
}: { label: string } & Omit<TextInputProps, 'style' | 'placeholderTextColor'>) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.ink2}
        style={[styles.input, input.multiline && styles.inputMultiline]}
        {...input}
      />
    </View>
  );
}

/** An error, in red with an icon and words: colour never carries meaning alone. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Icon icon={TriangleAlert} size={20} tint={role.error} />
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

/** An AI hint: yellow, a 2px black border and a round marker, beside the person's choice. */
export function AiHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.hint}>
      <View style={styles.hintLabel}>
        <View style={styles.hintMarker} />
        <Text style={styles.hintLabelText}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.ground },
  body: { padding: size.screenPadding, gap: size.gap, flexGrow: 1 },
  footer: { paddingHorizontal: size.screenPadding, paddingBottom: size.screenPadding, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: size.gap, minHeight: size.touchMin },
  title: {
    flex: 1,
    fontFamily: font.heading,
    fontSize: 30,
    lineHeight: 34,
    color: color.ink,
  },
  iconButton: {
    width: size.touchMin,
    height: size.touchMin,
    borderRadius: radius.button,
    borderWidth: border.strong.width,
    borderColor: border.strong.color,
    backgroundColor: color.plate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: size.workerButton,
    borderRadius: radius.button,
    borderWidth: border.strong.width,
    borderColor: border.strong.color,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  buttonPrimary: { backgroundColor: color.ink },
  buttonSecondary: { backgroundColor: color.plate },
  buttonText: { fontFamily: font.bodySemiBold, fontSize: 18 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  card: { backgroundColor: color.plate, borderRadius: radius.card, padding: 12, gap: 8 },
  cardStrong: { borderWidth: border.strong.width, borderColor: border.strong.color },
  cardQuiet: { borderWidth: border.quiet.width, borderColor: border.quiet.color },
  label: { fontFamily: font.bodySemiBold, fontSize: 15, color: color.ink2 },
  body17: { fontFamily: font.body, color: color.ink },
  field: { gap: 6 },
  input: {
    minHeight: size.touchMin + 4,
    borderRadius: radius.card,
    borderWidth: border.strong.width,
    borderColor: border.strong.color,
    backgroundColor: color.plate,
    paddingHorizontal: 12,
    fontFamily: font.body,
    fontSize: 18,
    color: color.ink,
  },
  inputMultiline: { minHeight: 120, paddingVertical: 10, textAlignVertical: 'top' },
  error: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderWidth: border.strong.width,
    borderColor: role.error,
    borderRadius: radius.card,
    backgroundColor: color.plate,
    padding: 10,
  },
  errorText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 16, color: color.ink },
  hint: {
    backgroundColor: role.ai,
    borderWidth: border.strong.width,
    borderColor: border.strong.color,
    borderRadius: radius.card,
    padding: 12,
    gap: 8,
  },
  hintLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: border.strong.width,
    borderColor: color.ink,
    backgroundColor: color.plate,
  },
  hintLabelText: { fontFamily: font.headingStrip, fontSize: 19, color: color.ink },
});
