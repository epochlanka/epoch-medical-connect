import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { WORKSPACES, homePathForRole, workspaceHome } from '../app/workspaces';
import './backButton.css';

// "← Back" at the top of every screen except the home screens (the dashboards, the front desk's
// check-in and the pharmacy queue). It goes to the previous screen; when there is none inside the
// app (a page opened from a bookmark or a new tab) it goes home instead of leaving E-POCH.
const HOMES = new Set(Object.values(WORKSPACES).map(workspaceHome));

export default function BackButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const home = user ? homePathForRole(user.role) : '/';
  const path = pathname.replace(/\/+$/, '');
  if (HOMES.has(path) || path === home) return null;

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(home);
  };

  return (
    <button type="button" className="app-back-btn" onClick={goBack} title="Back to the previous screen (Alt + ←)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}
