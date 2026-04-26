import { RefreshCw, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard }  from '../hooks/useDashboard.js'
import KpiCard           from '../components/dashboard/KpiCard.jsx'
import IngestionChart    from '../components/dashboard/IngestionChart.jsx'
import ScoringChart      from '../components/dashboard/ScoringChart.jsx'
import RecentLogs        from '../components/dashboard/RecentLogs.jsx'
import JobCard           from '../components/dashboard/JobCard.jsx'
import OllamaStatus      from '../components/dashboard/OllamaStatus.jsx'
import styles            from './DashboardPage.module.css'

export default function DashboardPage() {
  const navigate = useNavigate()

  const {
    loading,
    error,
    isOffline,
    kpiCards,
    velocity7d,
    velocity30d,
    scoring7d,
    scoring30d,
    logs,
    topMatches,
    refetch,
  } = useDashboard()

  return (
    <div className={styles.page}>

      {/* ── En-tête ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>
            Systems Overview
          </h1>
          <p className={styles.pageSub}>
            Autonomous intelligence active. Monitoring global job sources.
          </p>
        </div>

        <div className={styles.headerRight}>
          <OllamaStatus />
          <button
            className="btn-ghost"
            onClick={refetch}
            disabled={loading}
            title="Rafraîchir"
          >
            <RefreshCw
              size={13}
              strokeWidth={2}
              className={loading ? styles.spinning : ''}
            />
          </button>
        </div>
      </div>

      {/* ── Bannière offline ── */}
      {isOffline && (
        <div className={styles.offlineBanner}>
          <span className={styles.offlineDot} />
          Backend hors ligne — données de démonstration affichées.
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            className={styles.offlineLink}
          >
            Démarrer l'API →
          </a>
        </div>
      )}

      {/* ── Bannière erreur ── */}
      {error && !isOffline && (
        <div className={styles.errorBanner}>
          Erreur : {error.message ?? 'Impossible de charger les données.'}
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className={styles.kpiGrid}>
        {kpiCards.map(kpi => (
          <KpiCard key={kpi.id} {...kpi} loading={loading && !isOffline} />
        ))}
      </div>

      {/* ── Ingestion + Logs ── */}
      <div className={styles.midRow}>
        <IngestionChart velocity7d={velocity7d} velocity30d={velocity30d} />
        <RecentLogs logs={logs} />
      </div>

      {/* ── Scoring Chart ── */}
      <div className={styles.scoringRow}>
        <ScoringChart scoring7d={scoring7d} scoring30d={scoring30d} />
      </div>

      {/* ── High-Confidence Matches ── */}
      <div className={styles.matchesHeader}>
        <h2 className={`${styles.matchesTitle} font-headline tracking-tight`}>
          High-Confidence Matches
        </h2>
        <button
          className="btn-ghost"
          onClick={() => navigate('/scrapers')}
          title="Lancer un nouveau scraping"
        >
          Launch Pipeline →
        </button>
      </div>

      {topMatches.length === 0 && !loading ? (
        <div className={styles.emptyMatches}>
          Aucune offre analysée pour l'instant. Lance un scraping pour commencer.
        </div>
      ) : (
        <div className={styles.jobsGrid}>
          {topMatches.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* ── FAB : Lancer un scraping ── */}
      <button
        className={styles.fab}
        title="Lancer un nouveau scraping"
        onClick={() => navigate('/scrapers')}
      >
        <Search size={18} strokeWidth={2.5} />
      </button>

    </div>
  )
}
