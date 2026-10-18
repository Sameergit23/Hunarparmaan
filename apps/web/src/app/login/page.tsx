import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LanguageSwitch } from '@/components/language-switch';
import { BrandStripe, LogoTile } from '@/components/wire';
import { getMessages } from '@/lib/i18n';
import { currentUser, homePath } from '@/lib/session';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(homePath(user.role));
  const { m, lang } = await getMessages();
  return (
    <>
      <BrandStripe />
      <main className="mx-auto flex min-h-[calc(100vh-12px)] max-w-md flex-col gap-6 px-[18px] py-8">
        <div className="flex items-start justify-between gap-3">
          <a href="/" className="flex items-center gap-3 no-underline hover:text-ink">
            <LogoTile size={56} />
            <span className="flex flex-col leading-none">
              <span className="font-heading text-[28px] font-bold">{m.brand}</span>
              <span className="text-[15px] text-ink2">{m.brandOther}</span>
            </span>
          </a>
          <LanguageSwitch lang={lang} m={m} back="/login" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-heading text-[34px] font-bold">{m.login.title}</h1>
          <p className="m-0 text-[16px] text-ink2">{m.login.body}</p>
        </div>
        <LoginForm m={m} />
        <Link href="/activate" className="text-[16px] font-semibold">
          {m.login.activateLink}
        </Link>
      </main>
    </>
  );
}
