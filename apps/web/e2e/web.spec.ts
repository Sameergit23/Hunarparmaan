import { expect, test, type Page } from '@playwright/test';

// Demo accounts from pnpm db:seed (PIN 1234; the mock OTP is shown on screen).
const AGENCY = '9000000006';
const AWARDING_BODY = '9000000007';
const NCVET = '9000000008';
const AGENCY_ADMIN = '9000000011';
// Every seeded admin: platform, training-partner, agency (two agencies) and awarding-body admins.
const SEEDED_ADMINS = [
  '9000000009',
  '9000000014',
  '9000000010',
  '9000000015',
  '9000000011',
  '9000000016',
  '9000000018',
  '9000000019',
  '9000000012',
  '9000000017',
];
// The seed's pending agency invite (demo mode only).
const INVITED = '9000000013';
const DEMO_INVITE_CODE = '24681357';

/** Sign in with the demo PIN; the role decides the page it lands on. */
async function signIn(page: Page, phone: string, lands = 'Dashboard') {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  const demo = page.getByText(/^Demo code: \d{6}$/);
  const code = (await demo.textContent())!.replace(/\D/g, '');
  await page.getByLabel('6-digit code').fill(code);
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: lands, level: 1 })).toBeVisible();
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

test('NCVET sees aggregates only, and governance counts with no names (FR-32)', async ({
  page,
}) => {
  await signIn(page, NCVET);
  await expect(page.getByRole('navigation').getByRole('link')).toHaveText([
    'Dashboard',
    'Governance',
  ]);
  await expect(page.getByRole('heading', { name: 'Assessors' })).toHaveCount(0);
  await page.goto('/sessions');
  await expect(page.getByText('Your role cannot see this page.')).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Governance' }).click();
  await expect(page.getByRole('heading', { name: 'Governance', level: 1 })).toBeVisible();
  await expect(page.getByText(/^Assessment agencies: \d+ invites$/).first()).toBeVisible();
  await expect(page.getByText('Farhan Qureshi')).toHaveCount(0);
  await page.getByRole('button', { name: 'Verify chain' }).click();
  await expect(page.getByText(/^Verified: \d+ entries, unbroken$/)).toBeVisible();
  await noSidewaysScroll(page);
});

test('an invited agency user sets up their account in the browser', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Have an invite code? Set up your account' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your account', level: 1 })).toBeVisible();
  await page.getByLabel('Mobile number').fill(INVITED);
  await page.getByRole('button', { name: 'Send code' }).click();
  const code = (await page.getByText(/^Demo code: \d{6}$/).textContent())!.replace(/\D/g, '');
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Check code' }).click();

  const used = page.getByText('This number already has an account. Sign in instead.');
  const inviteCode = page.getByLabel('8-digit invite code');
  await expect(used.or(inviteCode)).toBeVisible();
  test.skip(await used.isVisible(), 'the demo invite was already accepted');
  await inviteCode.fill(DEMO_INVITE_CODE);
  await page.getByLabel('New PIN, 6 digits').fill('305718');
  await page.getByLabel('New PIN again').fill('305718');
  await page.getByRole('button', { name: 'Set up my account' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await noSidewaysScroll(page);
});

test('Change PIN refuses an easy PIN, and the header shows the last sign-in', async ({ page }) => {
  await signIn(page, AGENCY);
  await expect(page.getByText(/^(Last sign-in: .+|First sign-in)$/)).toBeAttached();
  await page.getByRole('link', { name: 'Change PIN' }).click();
  await expect(page.getByRole('heading', { name: 'Change your PIN', level: 1 })).toBeVisible();
  await page.getByLabel('Current PIN').fill('1234');
  await page.getByLabel('New PIN, 6 digits').fill('123456');
  await page.getByLabel('New PIN again').fill('123456');
  await page.getByRole('button', { name: 'Change PIN' }).click();
  await expect(page.getByText(/easy to guess/)).toBeVisible();
  await noSidewaysScroll(page);
});

test('E2E-06: an agency admin invites an assessor, who accepts; the admin deactivates them and the log verifies', async ({
  page,
  browser,
}) => {
  const phone = `9${String(Date.now()).slice(-9)}`;
  const name = `Asha Verma ${phone.slice(-4)}`;
  await signIn(page, AGENCY_ADMIN, 'People');
  await noSidewaysScroll(page);

  await page.getByRole('link', { name: 'Invite someone' }).click();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Role').selectOption({ label: 'Assessor' });
  await page.getByLabel('New staff').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  const confirm = page.getByRole('dialog');
  await expect(
    confirm.getByRole('heading', {
      name: `Invite ${name} as Assessor in Indore Assessment Agency?`,
    }),
  ).toBeVisible();
  await confirm.getByLabel('Your PIN').fill('1234');
  await confirm.getByRole('button', { name: 'Create invite' }).click();
  const code = (await page.getByTestId('one-time-code').textContent())!.replace(/\D/g, '');
  expect(code).toMatch(/^\d{8}$/);
  await noSidewaysScroll(page);
  await page.getByRole('button', { name: "I've passed it on" }).click();
  const invited = page.getByRole('listitem').filter({ hasText: name });
  await expect(invited).toContainText('Pending');
  await expect(page.getByTestId('one-time-code')).toHaveCount(0);

  // The assessor, in their own browser, sets up the account and signs in.
  const theirs = await browser.newContext();
  const invitee = await theirs.newPage();
  await invitee.goto('/invite');
  await invitee.getByLabel('Mobile number').fill(phone);
  await invitee.getByRole('button', { name: 'Send code' }).click();
  const sms = (await invitee.getByText(/^Demo code: \d{6}$/).textContent())!.replace(/\D/g, '');
  await invitee.getByLabel('6-digit code').fill(sms);
  await invitee.getByRole('button', { name: 'Check code' }).click();
  await invitee.getByLabel('8-digit invite code').fill(code);
  await invitee.getByLabel('New PIN, 6 digits').fill('305718');
  await invitee.getByLabel('New PIN again').fill('305718');
  await invitee.getByRole('button', { name: 'Set up my account' }).click();
  await expect(invitee.getByText('Your account is ready.', { exact: false })).toBeVisible();
  // The web sends an assessor to the phone app, which also shows the new PIN works.
  await invitee.goto('/login');
  await invitee.getByLabel('Mobile number').fill(phone);
  await invitee.getByRole('button', { name: 'Send code' }).click();
  const again = (await invitee.getByText(/^Demo code: \d{6}$/).textContent())!.replace(/\D/g, '');
  await invitee.getByLabel('6-digit code').fill(again);
  await invitee.getByLabel('PIN').fill('305718');
  await invitee.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    invitee.getByText('This account is for the phone app.', { exact: false }),
  ).toBeVisible();
  await theirs.close();

  // The admin finds the new assessor and deactivates the account.
  await page.goto('/admin/people');
  await page.getByLabel('Name or last 4 digits').fill(phone.slice(-4));
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Deactivate account' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: `Deactivate ${name}'s account?` }),
  ).toBeVisible();
  await dialog.getByLabel('Left the organisation').check();
  await dialog.getByLabel('Your PIN').fill('0000');
  await dialog.getByRole('button', { name: 'Deactivate account' }).click();
  await expect(dialog.getByText('That PIN is not right.')).toBeVisible();
  await dialog.getByLabel('Your PIN').fill('1234');
  await dialog.getByRole('button', { name: 'Deactivate account' }).click();
  // No phone, so nothing to drain: the account closes at once.
  await expect(page.getByText('Closed', { exact: true })).toBeVisible();
  await noSidewaysScroll(page);

  await page.getByRole('navigation').getByRole('link', { name: 'Audit log' }).click();
  const entries = page.getByRole('listitem').filter({ hasText: `About ${name}` });
  await expect(entries.filter({ hasText: 'Invited someone' })).toHaveCount(1);
  await expect(entries.filter({ hasText: 'Deactivated an account' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Verify chain' }).click();
  await expect(page.getByText(/^Verified: \d+ entries, unbroken$/)).toBeVisible();
  await noSidewaysScroll(page);
});

test('E2E-07: the admin pages fit a phone screen, in English and Hindi', async ({ page }) => {
  await signIn(page, AGENCY_ADMIN, 'People');
  for (const path of [
    '/admin/people',
    '/admin/people?tab=invites',
    '/admin/people/invite',
    '/admin/devices',
    '/admin/devices?stale=true',
    '/admin/audit',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await noSidewaysScroll(page);
  }

  // The seeded statuses: Mohan drains, Rekha's lost phone lists a session to re-assess.
  await page.goto('/admin/people?q=Mohan');
  await page.getByRole('link', { name: /Mohan Lal/ }).click();
  await expect(page.getByText('Draining', { exact: true }).first()).toBeVisible();
  await noSidewaysScroll(page);
  await page.goto('/admin/devices/demo-rekha-phone');
  await expect(page.getByText('Lost', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sessions to re-assess' })).toBeVisible();
  await expect(page.getByText('No signed result').first()).toBeVisible();
  await noSidewaysScroll(page);

  await page.goto('/admin/people');
  await page.getByRole('button', { name: /हिंदी/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('लोग');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'ऑडिट लॉग' })).toBeVisible();
  await noSidewaysScroll(page);
  await page.goto('/admin/audit');
  await expect(page.getByRole('button', { name: 'चेन जाँचें' })).toBeVisible();
  await noSidewaysScroll(page);
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit log');
});

test('FR-20: admin pages are only for admins, and admins never see the office screens', async ({
  page,
}) => {
  await signIn(page, AGENCY);
  await page.goto('/admin/people');
  await expect(page.getByText('This page is not for your account.')).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, AGENCY_ADMIN, 'People');
  await page.goto('/dashboard');
  await expect(page.getByText('This page is not for your account.')).toBeVisible();
  await page.getByRole('link', { name: 'Go to your home page' }).click();
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
});

test('every seeded admin can open People, Devices and Audit log', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser is enough to check every account');
  test.setTimeout(240_000);
  for (const phone of SEEDED_ADMINS) {
    await page.context().clearCookies();
    await signIn(page, phone, 'People');
    for (const [link, heading] of [
      ['Devices', 'Devices'],
      ['Audit log', 'Audit log'],
      ['People', 'People'],
    ] as const) {
      await page.getByRole('navigation').getByRole('link', { name: link }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 }), phone).toBeVisible();
    }
  }
});
