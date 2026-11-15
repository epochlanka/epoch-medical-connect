import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspaceNavigate } from '../../app/WorkspaceContext';
import './patientPanel.css';

/*
 * Click a patient's name anywhere and their profile slides in from the right, over the screen you
 * are on: queue, bills, lab tests, prescriptions... Close it (Esc, ×, or a click outside) and you
 * are exactly where you were. "Open full page" goes to the profile's own page.
 *
 * Every workspace is wrapped in the provider (app/guards.tsx). The profile itself is loaded only
 * when a panel is first opened, so the panel adds nothing to a screen's first load.
 */

const PatientProfile = lazy(() => import('./PatientProfile'));

interface PanelApi {
  openPatient: (patientId: string) => void;
}

const PanelCtx = createContext<PanelApi | null>(null);

export function PatientPanelProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<string | null>(null);
  const navigate = useWorkspaceNavigate();
  const location = useLocation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setShown(null), []);

  // Anything in the panel that goes to another screen (a prescription, the bills) closes it.
  useEffect(() => {
    setShown(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [shown, close]);

  const api = useMemo<PanelApi>(() => ({ openPatient: (id) => id && setShown(id) }), []);

  return (
    <PanelCtx.Provider value={api}>
      {children}
      {shown && (
        <div className="ppanel-backdrop" onClick={close}>
          <aside className="ppanel" role="dialog" aria-modal="true" aria-label="Patient profile" onClick={(e) => e.stopPropagation()}>
            <div className="ppanel-bar">
              <span className="ppanel-title">Patient profile</span>
              <button type="button" className="ppanel-btn" onClick={() => navigate(`/patients/${encodeURIComponent(shown)}`)}>
                Open full page
              </button>
              <button type="button" className="ppanel-close" onClick={close} aria-label="Close" ref={closeRef}>
                ×
              </button>
            </div>
            <div className="ppanel-body">
              <Suspense fallback={<p className="ppanel-loading">Loading patient…</p>}>
                <PatientProfile key={shown} patientId={shown} onOpenPatient={api.openPatient} />
              </Suspense>
            </div>
          </aside>
        </div>
      )}
    </PanelCtx.Provider>
  );
}

/** Opens a patient's profile in the side panel (or, outside a workspace, on its own page). */
export function usePatientPanel() {
  const ctx = useContext(PanelCtx);
  const navigate = useWorkspaceNavigate();
  return ctx ?? { openPatient: (id: string) => navigate(`/patients/${encodeURIComponent(id)}`) };
}

/**
 * A patient's name that opens their profile. Use it wherever a patient appears in a list. It stops
 * the click there, so a clickable table row underneath does not also fire.
 */
export function PatientLink({ patientId, children, className }: { patientId: string | null | undefined; children: ReactNode; className?: string }) {
  const { openPatient } = usePatientPanel();
  if (!patientId) return <>{children}</>;
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openPatient(patientId);
  };
  return (
    <button type="button" className={`patient-link${className ? ` ${className}` : ''}`} onClick={onClick} title="Open patient profile">
      {children}
    </button>
  );
}
