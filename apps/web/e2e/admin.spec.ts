import { expect, test, type Page } from '@playwright/test';

// Admin demo accounts from pnpm db:seed (PIN 1234; the mock OTP is shown on screen).
const PLATFORM_ADMIN = '9000000011';
const AGENCY_ADMIN = '9000000013';
const PIN = '1234';

// The tests change shared demo data (invites, deactivations), so they run in order.
test.describe.configure({ mode: 'serial' });

async function signIn(page: Page, phone: string, landing: string) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  const demo = page.getByText(/^Demo code: \d{6}$/);
  const code = (await demo.textContent())!.replace(/\D/g, '');
  await page.getByLabel('6-digit code').fill(code);
  await page.getByLabel('PIN').fill(PIN);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: landing, level: 1 })).toBeVisible();
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** A fresh made-up number for each run, so invites never collide with earlier runs. */
const freshPhone = () => `7${String(Date.now()).slice(-9)}`;

test('an agency admin manages people and phones, and never sees case data', async ({ page }) => {
  await signIn(page, AGENCY_ADMIN, 'People');
  await expect(page.getByText(/never score, sign or approve/)).toBeVisible();
  // Phone numbers are masked in lists (rule 8).
  await expect(page.getByText(/\d{2}x{6}\d{2}/).first()).toBeVisible();
  await expect(page.getByText(/9000000006/)).toHaveCount(0);

  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Sessions' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Approvals' })).toHaveCount(0);
  await page.goto('/sessions');
  await expect(page.getByText('Your role cannot see this page.')).toBeVisible();

  await page.goto('/admin/devices');
  await expect(page.getByRole('heading', { name: 'Phones', level: 1 })).toBeVisible();
  await noSidewaysScroll(page);

  await page.getByRole('navigation').getByRole('link', { name: 'Admin log' }).click();
  await expect(page.getByRole('heading', { name: 'Admin log', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Verify chain' }).click();
  await expect(page.getByText(/^Chain verified: \d+ entries$/)).toBeVisible();
});

test('an invite gives a one-time code; the person sets a PIN with it; the admin can deactivate them', async ({
  page,
}) => {
  const phone = freshPhone();
  await signIn(page, AGENCY_ADMIN, 'People');
  await page.getByText('Invite someone').click();
  await page.getByLabel('Role').selectOption({ label: 'Assessor' });
  await page.getByLabel('Name').fill('Test Assessor');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Your PIN').fill(PIN);
  await page.getByRole('button', { name: 'Create invite' }).click();
  const code = (await page.getByTestId('invite-code').textContent())!.trim();
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

  // The invited assessor sets a PIN; assessors then sign in on the phone app.
  await page.context().clearCookies();
  await page.goto('/activate');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('One-time code').fill(code);
  await page.getByLabel('New PIN (4 to 6 digits)').fill('4321');
  await page.getByLabel('New PIN again').fill('4321');
  await page.getByRole('button', { name: 'Set PIN and sign in' }).click();
  await expect(page.getByText(/Your account is ready/)).toBeVisible();

  // The same code works only once.
  await page.goto('/activate');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('One-time code').fill(code);
  await page.getByLabel('New PIN (4 to 6 digits)').fill('4321');
  await page.getByLabel('New PIN again').fill('4321');
  await page.getByRole('button', { name: 'Set PIN and sign in' }).click();
  await expect(page.getByText(/not valid or has expired/)).toBeVisible();

  // Back as the admin: a wrong PIN is refused, the right one deactivates.
  await signIn(page, AGENCY_ADMIN, 'People');
  const row = page.getByRole('listitem').filter({ hasText: 'Test Assessor' }).last();
  await row.getByText('Deactivate', { exact: true }).click();
  await row.getByLabel('Left the organisation').check();
  await row.getByLabel('Your PIN').fill('9999');
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect(row.getByText('That PIN is not right.')).toBeVisible();
  await row.getByLabel('Left the organisation').check();
  await row.getByLabel('Your PIN').fill(PIN);
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('Test Assessor is deactivated.')).toBeVisible();
});

test('the platform admin adds an organisation with its first admin, and sees every organisation', async ({
  page,
}) => {
  await signIn(page, PLATFORM_ADMIN, 'Organisations');
  await expect(page.getByText('CSDCI').first()).toBeVisible();
  await page.getByText('Add an organisation').first().click();
  await page.getByLabel('Organisation name').fill(`Test RPL Centre ${Date.now() % 100000}`);
  await page.getByLabel('Kind').selectOption({ label: 'Training partner' });
  await page.getByLabel('Name').fill('Test Centre Admin');
  await page.getByLabel('Mobile number').fill(freshPhone());
  await page.getByLabel('Your PIN').fill(PIN);
  await page.getByRole('button', { name: 'Add an organisation' }).click();
  await expect(page.getByTestId('invite-code')).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

  await page.goto('/admin/people');
  await expect(page.getByText(/Accounts in every organisation/)).toBeVisible();
  await expect(page.getByLabel('Organisation')).toBeVisible();
  await noSidewaysScroll(page);
});
