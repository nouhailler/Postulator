import { Outlet } from 'react-router-dom'
import TopBar      from './TopBar.jsx'
import SideBar     from './SideBar.jsx'
import HelpPanel   from './HelpPanel.jsx'
import OllamaBanner from './OllamaBanner.jsx'
import { OllamaStatusProvider } from '../../contexts/OllamaStatusContext.jsx'
import styles from './AppLayout.module.css'

export default function AppLayout() {
  return (
    <OllamaStatusProvider>
      <div className={styles.shell}>
        <TopBar />
        <OllamaBanner />
        <div className={styles.body}>
          <SideBar />
          <main className={styles.main}>
            <Outlet />
          </main>
        </div>
        {/* Bouton ? flottant + panneau d'aide contextuel */}
        <HelpPanel />
      </div>
    </OllamaStatusProvider>
  )
}
