import { expect, test, type Page } from '@playwright/test';

// Demo accounts from pnpm db:seed (PIN 1234; the mock OTP is shown on screen).
const AGENCY = '9000000006';
const AWARDING_BODY = '9000000007';
const NCVET = '9000000008';

async function signIn(page: Page, phone: string) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  const demo = page.getByText(/^Demo code: \d{6}$/);
  const code = (await demo.textContent())!.replace(/\D/g, '');
  await page.getByLabel('6-digit code').fill(code);
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the public site explains the flow and checks certificates', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your skill, certified');
  await expect(page.getByText('AI suggests').first()).toBeVisible();
  await expect(page.getByText('A person decides').first()).toBeVisible();
  await noSidewaysScroll(page);

  await page.getByLabel('Certificate code').fill('hp-notreal000');
  await page.getByRole('button', { name: 'Check certificate' }).click();
  await expect(page.getByText('No certificate has this code')).toBeVisible();
});

test('the language switch turns the site to Hindi and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /हिंदी/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('आपका हुनर');
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your skill');
});

test('the agency sees agreement, flags and sessions, and can re-check a hash chain', async ({
  page,
}) => {
  await signIn(page, AGENCY);
  await expect(page.getByRole('heading', { name: 'Assessor agreement' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Flags to review' })).toBeVisible();
  await noSidewaysScroll(page);

  await page.getByRole('navigation').getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('link', { name: /Ramesh Kumar/ }).click();
  await expect(page.getByRole('heading', { name: 'Ramesh Kumar' })).toBeVisible();
  await page.getByRole('button', { name: 'Check the hash chain' }).click();
  await expect(page.getByText(/^Verified: \d+ entries/)).toBeVisible();
  await noSidewaysScroll(page);
});

test('the agency sees a declaration synced from the phone, the AI hint beside the decision', async ({
  page,
}) => {
  await signIn(page, AGENCY);
  await page.getByRole('navigation').getByRole('link', { name: 'Declarations' }).click();
  await expect(page.getByRole('heading', { name: 'Declarations', level: 1 })).toBeVisible();

  const declaration = page.getByRole('region', { name: 'Ramesh Kumar' });
  await expect(declaration.getByText(/^AI hint: Direct assessment for Assistant/)).toBeVisible();
  await expect(
    declaration.getByRole('img', { name: /^Assistant Electrician, NSQF level 3: \d+% covered$/ }),
  ).toBeVisible();
  await expect(declaration.getByRole('heading', { name: "Mobiliser's decision" })).toBeVisible();
  await expect(declaration.getByText('Same as the AI suggestion')).toBeVisible();
  await noSidewaysScroll(page);
});

test('the awarding body approves a clean recommendation and the certificate verifies', async ({
  page,
}) => {
  await signIn(page, AWARDING_BODY);
  await page.getByRole('navigation').getByRole('link', { name: 'Approvals' }).click();
  await expect(page.getByRole('heading', { name: 'Approvals', level: 1 })).toBeVisible();
  const approve = page.getByRole('button', { name: 'Approve and issue certificate' }).first();
  test.skip((await approve.count()) === 0, 'no clean recommendation left in the demo data');
  await approve.click();
  const issued = page.getByText(/^Approved\. Certificate HP-[0-9A-Z]{10} issued\.$/);
  await expect(issued).toBeVisible();
  const code = (await issued.textContent())!.match(/HP-[0-9A-Z]{10}/)![0];

  await page.goto(`/verify/${code}`);
  await expect(page.getByText('This certificate is valid')).toBeVisible();
});

test('NCVET sees aggregates only', async ({ page }) => {
  await signIn(page, NCVET);
  await expect(page.getByRole('navigation').getByRole('link')).toHaveText(['Dashboard']);
  await expect(page.getByRole('heading', { name: 'Assessors' })).toHaveCount(0);
  await page.goto('/sessions');
  await expect(page.getByText('Your role cannot see this page.')).toBeVisible();
});
