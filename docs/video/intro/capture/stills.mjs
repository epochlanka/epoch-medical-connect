import { browser, session, BASE } from './rec.mjs';
import fs from 'fs';
fs.mkdirSync('stills', { recursive: true });
const b = await browser();
const snap = async (p, path, name, fn) => { await p.goto(BASE + path); await p.waitForTimeout(2500); if (fn) await fn(p); await p.screenshot({ path: `stills/${name}.png` }); };
const ph = await session(b, 'pharmacist', 'pharmacist123');
const r1 = await ph.request.get('http://localhost:3100/api/v1/pharmacy/prescriptions/2/label'); console.log('label', r1.status());
if (r1.ok()) fs.writeFileSync('stills/label.pdf', await r1.body());
await snap(ph, '/pharmacy/inventory/batches', 'batches');
await snap(ph, '/pharmacy/inventory/expiry-alerts', 'expiry');
await snap(ph, '/pharmacy/overview', 'pharmacy-overview');
await snap(ph, '/pharmacy/queue', 'pharmacy-queue');
const a = await session(b, 'admin', 'admin123');
await snap(a, '/admin/dashboard', 'admin-dashboard');
await snap(a, '/admin/reports', 'admin-reports');
await snap(a, '/admin/billing/payments', 'payments');
await snap(a, '/admin/users', 'users');
const d = await session(b, 'doctor', 'doctor123');
await snap(d, '/doctor/dashboard', 'doctor-dashboard');
await snap(d, '/doctor/reports/clinical-statistics', 'clinical-stats');
const r = await session(b, 'reception', 'reception123');
await snap(r, '/reception/dashboard', 'reception-checkin');
await snap(r, '/reception/queue/live', 'reception-queue');
await snap(r, '/reception/patients/register', 'register');
// workspace landing confirm screens
for (const [u, pw] of [['doctor','doctor123'],['pharmacist','pharmacist123'],['admin','admin123'],['reception','reception123']]) {
  const c = await b.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 }); const p = await c.newPage();
  await p.goto(BASE + '/login'); await p.fill('#username', u); await p.fill('#password', pw); await p.click('button:has-text("Sign In")');
  await p.waitForURL(/confirm/); await p.waitForTimeout(1500); await p.screenshot({ path: `stills/confirm-${u}.png` }); await c.close();
}
const c = await b.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 }); const p = await c.newPage();
await p.goto(BASE + '/login'); await p.waitForTimeout(1500); await p.screenshot({ path: 'stills/login.png' });
await b.close();
