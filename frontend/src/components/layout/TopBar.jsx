import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, Settings } from 'lucide-react'
import { useProfile }     from '../../hooks/useProfile.js'
import AlertsDrawer       from '../topbar/AlertsDrawer.jsx'
import SettingsDrawer     from '../topbar/SettingsDrawer.jsx'
import ProfileDrawer      from '../topbar/ProfileDrawer.jsx'
import styles from './TopBar.module.css'

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Scrapers',  path: '/scrapers' },
  { label: 'Analysis',  path: '/analysis' },
  { label: 'History',   path: '/history' },
  { label: 'Board',     path: '/board' },
]

export default function TopBar() {
  const { pathname }         = useLocation()
  const { initials }         = useProfile()
  const [alertsOpen,   setAlertsOpen]   = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen,  setProfileOpen]  = useState(false)

  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.left}>
          <span className={styles.logo}>Postulator</span>
          <nav className={styles.nav}>
            {NAV_ITEMS.map(({ label, path }) => (
              <Link key={path} to={path}
                className={`${styles.navLink} ${pathname.startsWith(path) ? styles.active : ''}`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className={styles.right}>
          <button
            className={`${styles.iconBtn} ${alertsOpen ? styles.iconBtnActive : ''}`}
            aria-label="Alertes"
            onClick={() => { setAlertsOpen(o => !o); setSettingsOpen(false); setProfileOpen(false) }}
          >
            <Bell size={17} strokeWidth={1.8} />
            <span className={styles.notifDot} />
          </button>

          <button
            className={`${styles.iconBtn} ${settingsOpen ? styles.iconBtnActive : ''}`}
            aria-label="Paramètres"
            onClick={() => { setSettingsOpen(o => !o); setAlertsOpen(false); setProfileOpen(false) }}
          >
            <Settings size={17} strokeWidth={1.8} />
          </button>

          <div
            className={`${styles.avatar} ${profileOpen ? styles.avatarActive : ''}`}
            title="Mon profil"
            onClick={() => { setProfileOpen(o => !o); setAlertsOpen(false); setSettingsOpen(false) }}
          >
            {initials}
          </div>
        </div>
      </header>

      <AlertsDrawer   open={alertsOpen}   onClose={() => setAlertsOpen(false)} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProfileDrawer  open={profileOpen}  onClose={() => setProfileOpen(false)} />
    </>
  )
}
