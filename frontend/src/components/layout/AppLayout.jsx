import { Outlet } from 'react-router-dom'
import TopBar    from './TopBar.jsx'
import SideBar   from './SideBar.jsx'
import HelpPanel from './HelpPanel.jsx'
import styles    from './AppLayout.module.css'

export default function AppLayout() {
  return (
    <div className={styles.shell}>
      <TopBar />
      <div className={styles.body}>
        <SideBar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      {/* Bouton ? flottant + panneau d'aide contextuel */}
      <HelpPanel />
    </div>
  )
}
