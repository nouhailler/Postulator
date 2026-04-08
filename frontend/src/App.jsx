import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout              from './components/layout/AppLayout.jsx'
import DashboardPage          from './pages/DashboardPage.jsx'
import CVPage                 from './pages/CVPage.jsx'
import JobsPage               from './pages/JobsPage.jsx'
import JobsIntelligencePage   from './pages/JobsIntelligencePage.jsx'
import ScrapersPage           from './pages/ScrapersPage.jsx'
import AnalysisPage           from './pages/AnalysisPage.jsx'
import CVMatchingPage         from './pages/CVMatchingPage.jsx'
import BoardPage              from './pages/BoardPage.jsx'
import HistoryPage            from './pages/HistoryPage.jsx'
import SettingsPage           from './pages/SettingsPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"          element={<DashboardPage />} />
        <Route path="cv"                 element={<CVPage />} />
        <Route path="jobs"               element={<JobsPage />} />
        <Route path="jobs-intelligence"  element={<JobsIntelligencePage />} />
        <Route path="scrapers"           element={<ScrapersPage />} />
        <Route path="analysis"           element={<AnalysisPage />} />
        <Route path="cv-matching"        element={<CVMatchingPage />} />
        <Route path="board"              element={<BoardPage />} />
        <Route path="history"            element={<HistoryPage />} />
        <Route path="settings"           element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
