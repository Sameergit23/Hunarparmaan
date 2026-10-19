import { Pressable, StyleSheet, Text } from 'react-native';
import { useI18n } from '../i18n';
import { border, color, font, radius, size } from '../theme';

/** Switches between Hindi and English; the label is in the other language, so it can be read. */
export function LanguageToggle() {
  const { lang, m, setLang } = useI18n();
  return (
    <Pressable
      onPress={() => setLang(lang === 'hi' ? 'en' : 'hi')}
      accessibilityRole="button"
      accessibilityLabel={m.language.switchLabel}
      style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.8 }]}
    >
      <Text style={styles.text}>{m.language.switchTo}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minHeight: size.touchMin,
    minWidth: size.touchMin,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    borderWidth: border.strong.width,
    borderColor: border.strong.color,
    backgroundColor: color.plate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontFamily: font.bodySemiBold, fontSize: 16, color: color.ink },
});
