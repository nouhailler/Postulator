import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Briefcase, Radio,
  Brain, Sparkles, Kanban, History, HelpCircle, LogOut, Plus,
} from 'lucide-react'
import styles from './SideBar.module.css'

const NAV_ITEMS = [
  { label: 'Overview',      path: '/dashboard',   icon: LayoutDashboard },
  { label: 'CV',            path: '/cv',           icon: FileText,  highlight: true },
  { label: 'Offres',        path: '/jobs',         icon: Briefcase },
  { label: 'Scrapers',      path: '/scrapers',     icon: Radio },
  { label: 'CV Intelligence', path: '/analysis',   icon: Brain },
  { label: 'CV Matching',   path: '/cv-matching',  icon: Sparkles,  highlight: true },
  { label: 'Pipeline',      path: '/board',        icon: Kanban },
  { label: 'Historique',    path: '/history',      icon: History },
]

const BOTTOM_ITEMS = [
  { label: 'Support',   path: '/support', icon: HelpCircle },
  { label: 'Sign Out',  path: '/logout',  icon: LogOut },
]

export default function SideBar() {
  const navigate = useNavigate()

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.brandIcon}>
          <span className={styles.brandIconInner}>⌘</span>
        </div>
        <div>
          <p className={styles.brandLabel}>Command Center</p>
          <p className={styles.brandTitle}>The Sovereign Architect</p>
        </div>
      </div>

      <button className={`btn-primary ${styles.newSearch}`} onClick={() => navigate('/scrapers')}>
        <Plus size={14} strokeWidth={2.5} />
        New Search
      </button>

      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ label, path, icon: Icon, highlight }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''} ${highlight ? styles.navHighlight : ''}`
            }
          >
            <Icon size={15} strokeWidth={1.8} className={styles.navIcon} />
            <span className={styles.navLabel}>{label}</span>
          </NavLink>
        ))}
      </nav>

      <nav className={styles.bottomNav}>
        {BOTTOM_ITEMS.map(({ label, path, icon: Icon }) => (
          <NavLink key={path} to={path} className={`${styles.navItem} ${styles.bottomItem}`}>
            <Icon size={15} strokeWidth={1.8} className={styles.navIcon} />
            <span className={styles.navLabel}>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
