import { BadgeCheck, ScanLine, X } from 'lucide-react';
import { CertificateVerification } from '@hunarpramaan/contracts';
import { SiteFooter, SiteHeader } from '@/components/site-header';
import { Button, ButtonLink, Card, Chip } from '@/components/wire';
import { apiGet } from '@/lib/api';
import { date } from '@/lib/format';
import { fill, getMessages } from '@/lib/i18n';
import { checkCertificate } from '../actions';

export const metadata = { title: 'Certificate check' };

/** The QR target: anyone can check a certificate without signing in. */
export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = decodeURIComponent(id);
  const { m, lang } = await getMessages();
  const result = await apiGet(
    `/v1/certificates/${encodeURIComponent(code)}/verify`,
    CertificateVerification,
    {
      auth: false,
    },
  );

  return (
    <>
      <SiteHeader m={m} lang={lang} path={`/verify/${id}`} />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-[18px] pt-6">
        <h1 className="m-0 font-heading text-[34px] font-bold">{m.verify.title}</h1>
        {result.valid ? (
          <Card strong>
            <div className="flex flex-wrap items-center gap-3">
              <Chip tone="done" icon={BadgeCheck}>
                {m.verify.valid}
              </Chip>
            </div>
            <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold text-ink2">{m.verify.holder}</dt>
              <dd className="m-0 font-heading text-[26px] font-bold">{result.holder}</dd>
              <dt className="font-semibold text-ink2">{m.verify.qualification}</dt>
              <dd className="m-0 text-[17px]">
                {result.qualificationTitle[lang]},{' '}
                {fill(m.verify.level, { level: result.nsqfLevel })}
                <span className="block text-sm text-ink2">{result.nqrCode}</span>
              </dd>
              <dt className="font-semibold text-ink2">{m.verify.awardingBody}</dt>
              <dd className="m-0 text-[17px]">{result.awardingBody}</dd>
              <dt className="font-semibold text-ink2">{m.verify.issuedOn}</dt>
              <dd className="m-0 text-[17px]">{date(result.issuedAt, lang)}</dd>
              <dt className="font-semibold text-ink2">{m.verify.code}</dt>
              <dd className="m-0 font-heading text-[20px] font-semibold tracking-wide">
                {result.certificateId}
              </dd>
            </dl>
            <p className="m-0 text-sm text-ink2">{m.verify.privacy}</p>
          </Card>
        ) : (
          <Card strong>
            <div className="flex items-center gap-3">
              <Chip tone="error" icon={X}>
                {m.verify.invalid}
              </Chip>
            </div>
            <p className="m-0 font-heading text-[22px] font-semibold tracking-wide">
              {result.certificateId}
            </p>
            <p className="m-0 text-[16px]">{m.verify.invalidBody}</p>
            <form action={checkCertificate} className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="code" className="sr-only">
                {m.landing.verifyLabel}
              </label>
              <input
                id="code"
                name="code"
                required
                defaultValue={result.certificateId}
                className="min-h-touch flex-1 rounded-card border-2 border-ink bg-plate px-3 font-heading text-[20px] font-semibold uppercase"
              />
              <Button type="submit" icon={ScanLine}>
                {m.landing.verifyButton}
              </Button>
            </form>
          </Card>
        )}
        <div>
          <ButtonLink href="/">{m.backHome}</ButtonLink>
        </div>
      </main>
      <SiteFooter m={m} />
    </>
  );
}
