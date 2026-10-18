'use client';

import { RotateCcw } from 'lucide-react';
import { BrandStripe, Button } from '@/components/wire';
import { en } from '@/lib/i18n/en';
import { hi } from '@/lib/i18n/hi';

/** Client-side error boundary. It cannot read the language cookie, so it shows both languages. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <BrandStripe />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-[18px] py-16">
        <h1 className="m-0 font-heading text-[34px] font-bold">{en.errors.title}</h1>
        <p className="m-0 text-[17px]">{en.errors.body}</p>
        <p lang="hi" className="m-0 text-[17px]">
          {hi.errors.title}. {hi.errors.body}
        </p>
        <div>
          <Button onClick={reset} icon={RotateCcw}>
            {en.errors.retry} / {hi.errors.retry}
          </Button>
        </div>
      </main>
    </>
  );
}
