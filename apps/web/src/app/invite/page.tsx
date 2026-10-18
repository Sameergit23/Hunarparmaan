import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LanguageSwitch } from '@/components/language-switch';
import { BrandStripe, LogoTile } from '@/components/wire';
import { getMessages } from '@/lib/i18n';
import { currentUser } from '@/lib/session';
import { InviteForm } from './invite-form';

export const metadata = { title: 'Set up your account' };

/** Accepting a staff invite (ADR 010): SMS code, then the invite code and a new PIN. */
export default async function InvitePage() {
  if (await currentUser()) redirect('/dashboard');
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
          <LanguageSwitch lang={lang} m={m} back="/invite" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-heading text-[34px] font-bold">{m.invite.title}</h1>
          <p className="m-0 text-[16px] text-ink2">{m.invite.body}</p>
        </div>
        <InviteForm m={m} />
        <Link href="/login" className="self-start text-[16px] font-semibold">
          {m.invite.signIn}
        </Link>
      </main>
    </>
  );
}
