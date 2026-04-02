/**
 * src/hooks/useDashboard.js
 * Agrège toutes les données du tableau de bord en un seul hook.
 *
 * Stratégie :
 *  1. Appel GET /api/dashboard/overview toutes les 60s (polling léger)
 *  2. Appel GET /api/jobs/top-matches (rafraîchi avec l'overview)
 *  3. Si l'API est offline → fallback sur mockData pour le dev sans backend
 */
import { useCallback } from 'react'
import { fetchOverview } from '../api/dashboard.js'
import { fetchTopMatches } from '../api/jobs.js'
import {
  kpiData      as mockKpi,
  velocityData7d as mockVelocity7d,
  velocityData30d as mockVelocity30d,
  recentLogs   as mockLogs,
  topMatches   as mockMatches,
} from '../data/mockData.js'
import { useAsync } from './useAsync.js'

// ── Adaptateurs API → format interne ──────────────────────────────────────

/** Transforme la réponse /dashboard/overview en kpiData[] pour KpiCard */
function adaptKpi(kpi) {
  if (!kpi) return mockKpi
  const deltaPct = kpi.total_jobs_delta_pct ?? 0
  return [
    {
      id: 'total_jobs',
      label: 'Total Jobs Found',
      value: kpi.total_jobs.toLocaleString('fr-FR'),
      sub: `${deltaPct >= 0 ? '+' : ''}${deltaPct}% from last cycle`,
      subType: deltaPct >= 0 ? 'positive' : 'neutral',
      icon: 'chart',
    },
    {
      id: 'matches',
      label: 'Matches > 80%',
      value: String(kpi.matches_above_80),
      sub: 'AI Recommended',
      subType: 'ai',
      icon: 'bolt',
      highlight: true,
    },
    {
      id: 'scrapers',
      label: 'Active Scrapers',
      value: String(kpi.active_scrapers).padStart(2, '0'),
      sub: 'Steady state ops',
      subType: 'neutral',
      icon: 'cpu',
    },
    {
      id: 'in_progress',
      label: 'In Progress',
      value: String(kpi.in_progress),
      sub: 'Awaiting response',
      subType: 'neutral',
      icon: 'clock',
    },
  ]
}

/** Transforme un JobSummary API en objet pour JobCard */
function adaptJob(job) {
  // Calcul des initiales depuis le nom de l'entreprise
  const initials = (job.company ?? '??')
    .split(/[\s\-&]+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  // Durée depuis publication
  const postedAt = job.published_at
    ? formatRelative(new Date(job.published_at))
    : 'récemment'

  // Tags depuis la description (heuristique simple) — à enrichir côté backend
  const tags = extractTags(job.title + ' ' + (job.description ?? ''))

  return {
    id: job.id,
    score: Math.round(job.ai_score ?? 0),
    company: job.company,
    initials,
    title: job.title,
    location: job.location ?? 'Non précisé',
    tags,
    source: job.source,
    postedAt,
    status: job.status,
  }
}

const TAG_KEYWORDS = [
  'React','Vue','Angular','TypeScript','JavaScript','Python','FastAPI','Django',
  'Node','Go','Rust','Java','Kotlin','Swift','Docker','Kubernetes','Linux',
  'AWS','GCP','Azure','Ollama','LLM','ML','AI','SQL','PostgreSQL','Redis',
  'Vite','Next.js','Tailwind','GraphQL','REST','Celery','SQLAlchemy',
]
function extractTags(text) {
  if (!text) return []
  const found = TAG_KEYWORDS.filter(t =>
    new RegExp(`\\b${t}\\b`, 'i').test(text)
  )
  return found.slice(0, 4)
}

function formatRelative(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  const days = Math.floor(diff / 86400)
  return `${days}j`
}

// ── Hook principal ─────────────────────────────────────────────────────────

export function useDashboard() {
  // 1. Overview (KPI + velocity + logs)
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useAsync(fetchOverview, [], { refetchInterval: 60_000, fallback: null })

  // 2. Top matches (offres IA > 80%)
  const {
    data: matchesRaw,
    loading: matchesLoading,
    error: matchesError,
    refetch: refetchMatches,
  } = useAsync(() => fetchTopMatches({ limit: 6, minScore: 80 }), [], {
    refetchInterval: 60_000,
    fallback: null,
  })

  // ── Dérivations ───────────────────────────────────────────────────────────
  const isOffline = !!overviewError

  // KPI cards
  const kpiCards = overview?.kpi ? adaptKpi(overview.kpi) : mockKpi

  // Velocity chart
  const velocity7d  = overview?.velocity_7d  ?? mockVelocity7d
  const velocity30d = overview?.velocity_30d ?? mockVelocity30d

  // Logs
  const logs = overview?.recent_logs?.length ? overview.recent_logs : mockLogs

  // Job cards — API si dispo, sinon mock
  const topMatches = matchesRaw?.length
    ? matchesRaw.map(adaptJob)
    : mockMatches

  const refetch = useCallback(() => {
    refetchOverview()
    refetchMatches()
  }, [refetchOverview, refetchMatches])

  return {
    // État
    loading: overviewLoading || matchesLoading,
    error: overviewError ?? matchesError,
    isOffline,

    // Données
    kpiCards,
    velocity7d,
    velocity30d,
    logs,
    topMatches,

    // Source stats (pour futurs graphiques camembert)
    sourceStats: overview?.source_stats ?? [],

    // Contrôle
    refetch,
  }
}
