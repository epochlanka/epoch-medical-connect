import { browser, session, record, click, type, moveTo, smoothScroll, BASE } from './rec.mjs';
const only = process.argv.slice(2);
const b = await browser();
const want = n => !only.length || only.includes(n);
const run = async (n, f) => { if (!want(n)) return; try { await f(); } catch (e) { console.log('FAIL', n, e.message.split('\n')[0]); } };

const r = await session(b, 'reception', 'reception123');
await run('find', async () => {
  await r.goto(BASE + '/reception/patients/all'); await r.waitForTimeout(1500); r.__m = { x: 1300, y: 700 };
  await record(r, 'find', async () => {
    await click(r, r.locator('input[placeholder^="Search by name, NIC"]'), 700); await type(r, 'Nimal', 120);
    await r.waitForTimeout(1500); await moveTo(r, r.locator('text=Nimal Perera').first(), 700); await r.waitForTimeout(800);
  });
});
await run('family', async () => {
  await r.goto(BASE + '/reception/families/roster'); await r.waitForTimeout(1500); r.__m = { x: 1300, y: 700 };
  await record(r, 'family', async () => {
    await click(r, r.locator('input[placeholder^="Search family"]'), 700); await type(r, 'Perera', 110);
    await r.waitForTimeout(1200); await click(r, r.locator('text=Perera Family').first(), 600); await r.waitForTimeout(2000);
  });
});
await run('queue', async () => {
  await r.goto(BASE + '/reception/queue/live'); await r.waitForTimeout(1800); r.__m = { x: 900, y: 500 };
  await record(r, 'queue', async () => {
    await moveTo(r, r.locator('button:has-text("Call Next")'), 1100); await r.waitForTimeout(400);
    await click(r, r.locator('button:has-text("Call Next")'), 200); await r.waitForTimeout(2500);
  });
});

const d = await session(b, 'doctor', 'doctor123');
await run('consult', async () => {
  await d.goto(BASE + '/doctor/dashboard'); await d.waitForTimeout(1800); d.__m = { x: 1000, y: 700 };
  await record(d, 'consult', async () => {
    await click(d, d.locator('text=Continue consultation'), 800); await d.waitForTimeout(2200);
    await click(d, d.locator('button:has-text("Patient history"), [role=tab]:has-text("Patient history")').first(), 800); await d.waitForTimeout(1200);
    await smoothScroll(d, 450, 1200); await d.waitForTimeout(1200);
  });
});
await run('icd', async () => {
  await d.goto(BASE + '/doctor/consultations/workspace/3'); await d.waitForTimeout(2000);
  const icd = d.locator('input[placeholder^="Search WHO ICD-11"]');
  await icd.evaluate(e => e.scrollIntoView({ block: 'center' })); await d.mouse.wheel(0, -150); await d.waitForTimeout(800); d.__m = { x: 1300, y: 300 };
  await record(d, 'icd', async () => {
    await click(d, icd, 700); await type(d, 'diabetes', 110); await d.waitForTimeout(1600);
    await click(d, d.locator('text=Type 2 diabetes mellitus').first(), 800); await d.waitForTimeout(1500);
  });
});
await run('rx', async () => {
  await d.goto(BASE + '/doctor/consultations/workspace/3'); await d.waitForTimeout(2200);
  await d.click('button:has-text("Prescribe medicines")'); await d.waitForURL(/prescriptions\/new/); await d.waitForTimeout(2200); d.__m = { x: 1300, y: 400 };
  await record(d, 'rx', async () => {
    await click(d, d.locator('input[placeholder^="Search medicine"]'), 700); await type(d, 'para', 120); await d.waitForTimeout(900);
    await click(d, d.locator('text=Paracetamol 500mg (500mg)'), 600); await d.waitForTimeout(900);
    await smoothScroll(d, 300, 700); await d.waitForTimeout(300);
    await click(d, d.locator('input[placeholder="TDS"]'), 600); await type(d, 'TDS', 140); await d.keyboard.press('Tab'); await d.waitForTimeout(300);
    await click(d, d.locator('input[placeholder="5 Days"]'), 500); await type(d, '5 Days', 120); await d.keyboard.press('Tab'); await d.waitForTimeout(1800);
  });
});

const ph = await session(b, 'pharmacist', 'pharmacist123');
await run('dispense', async () => {
  await ph.goto(BASE + '/pharmacy/queue'); await ph.waitForTimeout(1800); ph.__m = { x: 1000, y: 500 };
  await record(ph, 'dispense', async () => {
    await click(ph, ph.locator('text=Open prescription').first(), 900); await ph.waitForTimeout(1800);
    await click(ph, ph.locator('text=I checked this patient').first(), 800); await ph.waitForTimeout(600);
    await smoothScroll(ph, 300, 700);
    await click(ph, ph.locator('text=/I picked/').first(), 800); await ph.waitForTimeout(700);
    await click(ph, ph.locator('button:has-text("Review picked medicines")'), 800); await ph.waitForTimeout(1800);
    await click(ph, ph.locator('button:has-text("Confirm and record")'), 800); await ph.waitForTimeout(2500);
  });
  await ph.screenshot({ path: 'shots/after-dispense.png' });
  console.log(await ph.locator('button').allInnerTexts());
});

const a = await session(b, 'admin', 'admin123');
await run('billing', async () => {
  await a.goto(BASE + '/admin/billing/invoices'); await a.waitForTimeout(2000); a.__m = { x: 900, y: 600 };
  await record(a, 'billing', async () => {
    await click(a, a.locator('button:has-text("INV-2026-0005")'), 900); await a.waitForTimeout(900);
    await smoothScroll(a, 420, 1200); await a.waitForTimeout(500);
    const cr = a.locator('button:has-text("Cash Reconciliation")'); await cr.evaluate(e => e.scrollIntoView({block:'center', behavior:'smooth'})); await a.waitForTimeout(900);
    await click(a, cr, 900); await a.waitForTimeout(2500);
  });
});
await run('recon', async () => {
  await a.goto(BASE + '/admin/billing/invoices'); await a.waitForTimeout(2000);
  const cr = a.locator('button:has-text("Cash Reconciliation")'); await cr.evaluate(e => e.scrollIntoView({block:'center'})); await a.waitForTimeout(800); a.__m = { x: 1100, y: 500 };
  await record(a, 'recon', async () => { await click(a, cr, 1000); await a.waitForTimeout(3000); });
  console.log(await a.locator('[role=dialog] button, .modal button').allInnerTexts());
});
await run('audit', async () => {
  await a.goto(BASE + '/admin/users'); await a.waitForTimeout(2000); a.__m = { x: 900, y: 600 };
  await record(a, 'audit', async () => {
    await click(a, a.locator('button:has-text("Audit Log")'), 900); await a.waitForTimeout(2500);
  });
});
await b.close();
