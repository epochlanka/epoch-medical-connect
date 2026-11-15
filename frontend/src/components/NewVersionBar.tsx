import { useEffect, useState } from 'react';

// The app loads its code once, when the page opens, and keeps running it until the page is reloaded.
// After an update the clinic's PCs would otherwise go on running the old version without anyone
// knowing. This compares the app script the server lists now with the one this page started with —
// every few minutes and whenever the window comes back into focus — and offers a reload when they
// differ. A draft prescription is kept on the computer, so reloading loses nothing.

const CHECK_EVERY_MS = 5 * 60_000;

const scriptOf = (html: string) => html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1] ?? null;

export default function NewVersionBar() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    // Only a built app has a versioned script name; the development server never changes it.
    const loaded = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
    if (!loaded) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch('/', { cache: 'no-store' });
        if (!res.ok) return;
        const current = scriptOf(await res.text());
        if (current && current !== loaded) setAvailable(true);
      } catch {
        /* offline or restarting — try again later */
      }
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  if (!available) return null;
  return (
    <div role="status" style={{ position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 10000, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: '#1e293b', color: '#fff', fontSize: 14, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)', maxWidth: 'calc(100vw - 32px)' }}>
      <span>A new version of E-POCH is available.</span>
      <button type="button" onClick={() => window.location.reload()} style={{ border: 0, borderRadius: 8, padding: '6px 12px', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>
        Reload
      </button>
      <button type="button" onClick={() => setAvailable(false)} aria-label="Later" style={{ border: 0, background: 'none', color: '#cbd5e1', cursor: 'pointer', font: 'inherit' }}>
        Later
      </button>
    </div>
  );
}
