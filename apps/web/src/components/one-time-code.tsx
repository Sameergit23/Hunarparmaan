'use client';

import { CircleCheck } from 'lucide-react';
import { Button } from './wire';

/**
 * An invite or PIN reset code, shown once in large Rajdhani digits (TRD
 * section 7.2). "I've passed it on" closes it; the code isn't kept anywhere
 * after that, and can't be shown again.
 */
export function OneTimeCode({
  code,
  title,
  valid,
  how,
  done,
  onDone,
}: {
  code: string;
  title: string;
  valid: string;
  how: string;
  done: string;
  onDone: () => void;
}) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <h2 className="m-0 font-heading text-[22px] font-bold">{title}</h2>
      <p
        className="m-0 font-heading text-[44px] font-bold leading-none tracking-[0.12em]"
        data-testid="one-time-code"
      >
        {code.slice(0, 4)} {code.slice(4)}
      </p>
      <p className="m-0 text-[15px] font-semibold">{valid}</p>
      <p className="m-0 text-[15px]">{how}</p>
      <Button type="button" icon={CircleCheck} onClick={onDone} className="self-start">
        {done}
      </Button>
    </div>
  );
}
