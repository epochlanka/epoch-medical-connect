import { NavLink as AppNavLink } from 'react-router-dom';
import { WsNavLink as NavLink } from '../../../../app/WorkspaceContext';
import { WORKSPACES, workspaceHome } from '../../../../app/workspaces';
import { useAuth } from '../../context/AuthContext';
import { SettingsIcon } from './Icons';
import { navSections } from './navConfig';

const BrandMark = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h4l1.5-4L12 16l1.5-5L15 12h5" />
  </svg>
);

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

const Sidebar = ({ open, onNavigate }: SidebarProps) => {
  const { user } = useAuth();
  return (
    <aside className={`shell-sidebar${open ? ' open' : ''}`}>
      <div className="shell-brand">
        <div className="shell-brand-icon">
          <BrandMark />
        </div>
        <div className="shell-brand-text">
          <span className="shell-brand-name">E-POCH</span>
          <span className="shell-brand-sub">MEDICAL SYSTEM</span>
        </div>
      </div>

      <nav className="shell-nav">
        {navSections.map((section) => (
          <div className="shell-nav-section" key={section.label}>
            <div className="shell-nav-label">{section.label.toUpperCase()}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={({ isActive }) => `shell-nav-link${isActive ? ' active' : ''}`}
              >
                <item.icon />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
        {/* Administrators also use this workspace; give them the way back. */}
        {user?.role === 'Admin' && (
          <div className="shell-nav-section">
            <div className="shell-nav-label">ADMINISTRATION</div>
            <AppNavLink to={workspaceHome(WORKSPACES.admin)} onClick={onNavigate} className="shell-nav-link">
              <SettingsIcon />
              Back to Administration
            </AppNavLink>
          </div>
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
