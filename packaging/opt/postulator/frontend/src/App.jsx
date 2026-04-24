import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout              from './components/layout/AppLayout.jsx'
import AutomationPage         from './pages/AutomationPage.jsx'
import DashboardPage          from './pages/DashboardPage.jsx'
import CVPage                 from './pages/CVPage.jsx'
import JobsPage               from './pages/JobsPage.jsx'
import JobAnalysisPage        from './pages/JobAnalysisPage.jsx'
import JobsIntelligencePage   from './pages/JobsIntelligencePage.jsx'
import ScrapersPage           from './pages/ScrapersPage.jsx'
import AnalysisPage           from './pages/AnalysisPage.jsx'
import CVMatchingPage         from './pages/CVMatchingPage.jsx'
import BoardPage              from './pages/BoardPage.jsx'
import HistoryPage            from './pages/HistoryPage.jsx'
import SettingsPage           from './pages/SettingsPage.jsx'

// ── Appliquer le thème sauvegardé au démarrage ────────────────────────────────
function applyTheme(theme, customColor) {
  const root = document.documentElement
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
    root.style.removeProperty('--surface')
  } else if (theme === 'custom' && customColor) {
    root.removeAttribute('data-theme')
    root.style.setProperty('--surface', customColor)
    // Dériver surface-container depuis la couleur custom (légèrement plus clair)
    root.style.setProperty('--surface-container', customColor + 'cc')
    root.style.setProperty('--surface-container-low', customColor + 'dd')
  } else {
    // dark (défaut)
    root.removeAttribute('data-theme')
    root.style.removeProperty('--surface')
    root.style.removeProperty('--surface-container')
    root.style.removeProperty('--surface-container-low')
  }
}

export default function App() {
  useEffect(() => {
    const theme       = localStorage.getItem('postulator_theme') || 'dark'
    const customColor = localStorage.getItem('postulator_custom_color') || ''
    applyTheme(theme, customColor)
  }, [])

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"          element={<DashboardPage />} />
        <Route path="cv"                 element={<CVPage />} />
        <Route path="jobs"               element={<JobsPage />} />
        <Route path="jobs-intelligence"  element={<JobsIntelligencePage />} />
        <Route path="job-analysis"       element={<JobAnalysisPage />} />
        <Route path="scrapers"           element={<ScrapersPage />} />
        <Route path="analysis"           element={<AnalysisPage />} />
        <Route path="cv-matching"        element={<CVMatchingPage />} />
        <Route path="board"              element={<BoardPage />} />
        <Route path="history"            element={<HistoryPage />} />
        <Route path="automation"         element={<AutomationPage />} />
        <Route path="settings"           element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
