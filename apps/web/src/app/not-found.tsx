import { ButtonLink, BrandStripe } from '@/components/wire';
import { getMessages } from '@/lib/i18n';

export default async function NotFound() {
  const { m } = await getMessages();
  return (
    <>
      <BrandStripe />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-[18px] py-16">
        <h1 className="m-0 font-heading text-[34px] font-bold">{m.errors.notFound}</h1>
        <div>
          <ButtonLink href="/">{m.backHome}</ButtonLink>
        </div>
      </main>
    </>
  );
}
