'use server';

import { redirect } from 'next/navigation';

/** Normalise what was typed (spaces, lower case) and open the check page. */
export async function checkCertificate(formData: FormData) {
  const code = String(formData.get('code') ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z-]/g, '');
  if (code.length < 3) redirect('/#verify');
  redirect(`/verify/${encodeURIComponent(code)}`);
}
