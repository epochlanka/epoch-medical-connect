import { browser, session, record, click, type, moveTo, BASE } from './rec.mjs';
const b = await browser();
const p = await session(b);
await p.goto(BASE + '/login'); await p.waitForTimeout(1200);
p.__m = { x: 1200, y: 750 };
await record(p, 'login', async () => {
  await click(p, p.locator('#username'), 700); await type(p, 'reception', 80);
  await click(p, p.locator('#password'), 350); await type(p, '••••••••'.length ? 'reception123' : '', 55);
  await click(p, p.locator('button:has-text("Sign In")'), 450);
  await p.waitForURL(/confirm/); await p.waitForTimeout(1300);
  await click(p, p.locator('button:has-text("Confirm and continue")'), 600);
  await p.waitForTimeout(2500);
});
await b.close();
