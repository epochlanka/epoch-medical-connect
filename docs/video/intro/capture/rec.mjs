import { chromium } from 'playwright-core';
import fs from 'fs';
import { execFileSync } from 'child_process';
export const BASE = 'http://localhost:5180';
const CURSOR = `
(() => {
  const mk = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.6 L14.6 20.3 L11.5 13.6 L17.8 13.6 Z" fill="#0f172a" stroke="white" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed',left:'-100px',top:'-100px',zIndex:2147483647,pointerEvents:'none',filter:'drop-shadow(0 3px 6px rgba(0,0,0,.35))',transform:'translate(-6px,-3px)'});
    document.documentElement.appendChild(c);
    const st = document.createElement('style');
    st.textContent = '@keyframes __rp{from{transform:translate(-50%,-50%) scale(.2);opacity:.9}to{transform:translate(-50%,-50%) scale(1.6);opacity:0}} .__rp{position:fixed;width:46px;height:46px;border-radius:50%;background:rgba(37,99,235,.35);border:2px solid rgba(37,99,235,.8);pointer-events:none;z-index:2147483646;animation:__rp .55s ease-out forwards}';
    document.documentElement.appendChild(st);
    const pos = window.__curPos || {x:-100,y:-100}; c.style.left = pos.x+'px'; c.style.top = pos.y+'px';
  };
  document.addEventListener('mousemove', e => { mk(); const c = document.getElementById('__cur'); c.style.left = e.clientX+'px'; c.style.top = e.clientY+'px'; window.__curPos={x:e.clientX,y:e.clientY}; }, true);
  document.addEventListener('mousedown', e => { const r = document.createElement('div'); r.className='__rp'; r.style.left=e.clientX+'px'; r.style.top=e.clientY+'px'; document.documentElement.appendChild(r); setTimeout(()=>r.remove(),700); }, true);
  // hide scrollbars for a cleaner capture
  const s2 = document.createElement('style'); s2.textContent='::-webkit-scrollbar{display:none} *{scrollbar-width:none}';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s2));
})();`;

export async function browser() { return chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--hide-scrollbars'] }); }

export async function session(b, u, pw) {
  const ctx = await b.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  await ctx.addInitScript(CURSOR);
  const p = await ctx.newPage();
  p.__m = { x: 900, y: 600 };
  if (u) {
    await p.goto(BASE + '/login');
    await p.fill('#username', u); await p.fill('#password', pw);
    await p.click('button:has-text("Sign In")');
    await p.waitForURL(/confirm/);
    await p.click('button:has-text("Confirm and continue")');
    await p.waitForTimeout(1500);
  }
  return p;
}

const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
export async function moveTo(p, target, ms = 650) {
  let x, y;
  if (Array.isArray(target)) [x, y] = target;
  else { const bb = await target.boundingBox(); x = bb.x + bb.width / 2; y = bb.y + bb.height / 2; }
  const { x: x0, y: y0 } = p.__m; const n = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) { const t = ease(i / n); await p.mouse.move(x0 + (x - x0) * t, y0 + (y - y0) * t); await p.waitForTimeout(16); }
  p.__m = { x, y };
}
export async function click(p, target, ms) { await moveTo(p, target, ms); await p.waitForTimeout(120); await p.mouse.down(); await p.waitForTimeout(70); await p.mouse.up(); }
export async function type(p, text, delay = 85) { for (const ch of text) { await p.keyboard.type(ch); await p.waitForTimeout(delay + Math.random() * 40); } }
export async function smoothScroll(p, dy, ms = 900) { const n = Math.round(ms / 16); let done = 0; for (let i = 1; i <= n; i++) { const tgt = Math.round(dy * ease(i / n)); await p.mouse.wheel(0, tgt - done); done = tgt; await p.waitForTimeout(16); } }

export async function record(p, name, fn) {
  const cdp = await p.context().newCDPSession(p);
  const frames = [];
  cdp.on('Page.screencastFrame', async f => { frames.push({ d: f.data, t: f.metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  // nudge a repaint so the first frame arrives
  await p.mouse.move(p.__m.x, p.__m.y);
  await p.waitForTimeout(300);
  await fn();
  await p.waitForTimeout(600);
  const tEnd = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  const dir = `frames/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let list = '';
  frames.forEach((f, i) => {
    const fn2 = `${dir}/${String(i).padStart(5, '0')}.jpg`; fs.writeFileSync(fn2, Buffer.from(f.d, 'base64'));
    const next = frames[i + 1]?.t ?? Math.max(f.t + 0.5, frames[frames.length-1].t + 0.5);
    list += `file '${process.cwd()}/${fn2}'\nduration ${(next - f.t).toFixed(4)}\n`;
  });
  list += `file '${process.cwd()}/${dir}/${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(`${dir}/list.txt`, list);
  fs.mkdirSync('clips', { recursive: true });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'scale=1920:1080:flags=lanczos,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-movflags', '+faststart', `clips/${name}.mp4`]);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `clips/${name}.mp4`]).toString().trim();
  console.log(`clip ${name}: ${frames.length} frames, ${dur}s`);
}
