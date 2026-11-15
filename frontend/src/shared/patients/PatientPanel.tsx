import type { MouseEvent, ReactNode } from 'react';
import { useWorkspaceNavigate } from '../../app/WorkspaceContext';
import './patientPanel.css';

/**
 * A patient's name that opens their profile page. Use it wherever a patient appears in a list. It
 * stops the click there, so a clickable table row underneath does not also fire. The Back button
 * at the top of the profile returns to the list.
 */
export function PatientLink({ patientId, children, className }: { patientId: string | null | undefined; children: ReactNode; className?: string }) {
  const navigate = useWorkspaceNavigate();
  if (!patientId) return <>{children}</>;
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/patients/${encodeURIComponent(patientId)}`);
  };
  return (
    <button type="button" className={`patient-link${className ? ` ${className}` : ''}`} onClick={onClick} title="Open patient profile">
      {children}
    </button>
  );
}
