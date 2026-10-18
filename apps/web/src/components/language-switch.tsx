import { Languages } from 'lucide-react';
import { switchLanguage } from '@/app/actions';
import type { Lang, Messages } from '@/lib/i18n';
import { Icon } from './icon';

/** Shows the other language's name, in that language. */
export function LanguageSwitch({
  lang,
  m,
  back,
  onDark = false,
}: {
  lang: Lang;
  m: Messages;
  back: string;
  onDark?: boolean;
}) {
  return (
    <form action={switchLanguage}>
      <input type="hidden" name="lang" value={lang === 'en' ? 'hi' : 'en'} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        aria-label={`${m.language.label}: ${m.language.switchTo}`}
        className={
          onDark
            ? 'inline-flex min-h-touch items-center gap-2 rounded-card border-2 border-plate px-3 font-semibold text-plate'
            : 'inline-flex min-h-touch items-center gap-2 rounded-card border-2 border-ink bg-plate px-3 font-semibold text-ink'
        }
      >
        <Icon as={Languages} size={18} />
        {m.language.switchTo}
      </button>
    </form>
  );
}
