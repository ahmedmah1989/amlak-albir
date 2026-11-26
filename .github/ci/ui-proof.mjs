import { chromium } from 'playwright';
import fs from 'node:fs';

// Amlak Albir desktop-mode UI proof (synthetic data only).
// phase1: login -> forced password change -> create tenant via UI (screenshots)
// phase2: after server restart -> tenant still listed (persistence)
// phase3: after update.bat rebuild -> tenant still listed (update keeps data)
const phase = process.argv[2];
const base = 'http://localhost:3000';
const TENANT = 'مستأجر اختبار CI';
const DEFAULT_PASS = process.env.DEFAULT_PASS;
const NEW_PASS = process.env.CI_NEWPASS;
const stateDir = 'state';
const statePath = stateDir + '/session.json';

fs.mkdirSync('shots', { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

const browser = await chromium.launch();
const ctxOpts = { viewport: { width: 1366, height: 900 } };
if (phase !== 'phase1' && fs.existsSync(statePath)) ctxOpts.storageState = statePath;
const context = await browser.newContext(ctxOpts);
const page = await context.newPage();

async function shot(name) {
  await page.screenshot({ path: 'shots/' + name + '.png', fullPage: true });
}

async function assertTenantListed(shotName) {
  await page.goto(base + '/tenants?f=all', { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login')) {
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', NEW_PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 });
    console.log('RELOGIN_OK');
    await page.goto(base + '/tenants?f=all', { waitUntil: 'domcontentloaded' });
  } else {
    console.log('SESSION_PERSISTED');
  }
  await page.getByText(TENANT).first().waitFor({ timeout: 15000 });
  await shot(shotName);
}

if (phase === 'phase1') {
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
  await shot('01-login');
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', DEFAULT_PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 });
  if (page.url().includes('/account')) {
    await shot('02-must-change');
    const pwForm = page.locator('form:has(input[name="new"])');
    await pwForm.locator('input[name="current"]').fill(DEFAULT_PASS);
    await pwForm.locator('input[name="new"]').fill(NEW_PASS);
    await pwForm.locator('input[name="confirm"]').fill(NEW_PASS);
    await pwForm.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.toString().includes('/account'), { timeout: 20000 });
    console.log('PASSWORD_CHANGED_OK');
  }
  await shot('03-dashboard');
  await page.goto(base + '/tenants/new', { waitUntil: 'domcontentloaded' });
  const tForm = page.locator('form:has(input[name="name"])');
  await tForm.locator('input[name="name"]').fill(TENANT);
  await tForm.locator('input[name="phone"]').fill('0500000099');
  await tForm.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.toString().includes('/tenants/new'), { timeout: 20000 });
  await page.goto(base + '/tenants?f=all', { waitUntil: 'domcontentloaded' });
  await page.getByText(TENANT).first().waitFor({ timeout: 15000 });
  await shot('04-tenant-created');
  await context.storageState({ path: statePath });
  console.log('PHASE1_OK');
} else if (phase === 'phase2') {
  await assertTenantListed('05-after-restart');
  console.log('PHASE2_OK');
} else if (phase === 'phase3') {
  await assertTenantListed('06-after-update');
  console.log('PHASE3_OK');
} else {
  throw new Error('unknown phase ' + phase);
}

await browser.close();
