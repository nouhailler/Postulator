/**
 * src/hooks/useDashboard.js
 * Agrège toutes les données du tableau de bord en un seul hook.
 */
import { useCallback } from 'react'
import { fetchOverview } from '../api/dashboard.js'
import { fetchTopMatches } from '../api/jobs.js'
import {
  kpiData       as mockKpi,
  velocityData7d  as mockVelocity7d,
  velocityData30d as mockVelocity30d,
  recentLogs    as mockLogs,
  topMatches    as mockMatches,
} from '../data/mockData.js'
import { useAsync } from './useAsync.js'

// ── Adaptateurs API → format interne ──────────────────────────────────────

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

function adaptJob(job) {
  const initials = (job.company ?? '??')
    .split(/[\s\-&]+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  const postedAt = job.published_at
    ? formatRelative(new Date(job.published_at))
    : formatRelative(new Date(job.scraped_at))

  const tags = extractTags(job.title + ' ' + (job.description ?? ''))

  return {
    id:           job.id,
    score:        Math.round(job.ai_score ?? 0),
    company:      job.company,
    initials,
    title:        job.title,
    location:     job.location ?? 'Non précisé',
    tags,
    source:       job.source,
    postedAt,
    status:       job.status,
    url:          job.url || null,
    ai_summary:   job.ai_summary || null,
    is_remote:    job.is_remote || false,
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
  const found = TAG_KEYWORDS.filter(t => new RegExp(`\\b${t}\\b`, 'i').test(text))
  return found.slice(0, 4)
}

function formatRelative(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (isNaN(diff) || diff < 0) return 'récemment'
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  const days = Math.floor(diff / 86400)
  return `${days}j`
}

// ── Hook principal ─────────────────────────────────────────────────────────

export function useDashboard() {
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useAsync(fetchOverview, [], { refetchInterval: 60_000, fallback: null })

  const {
    data: matchesRaw,
    loading: matchesLoading,
    error: matchesError,
    refetch: refetchMatches,
  } = useAsync(() => fetchTopMatches({ limit: 6, minScore: 60 }), [], {
    refetchInterval: 60_000,
    fallback: null,
  })

  const isOffline = !!overviewError

  const kpiCards  = overview?.kpi ? adaptKpi(overview.kpi) : mockKpi

  const velocity7d  = overview?.velocity_7d  ?? mockVelocity7d
  const velocity30d = overview?.velocity_30d ?? mockVelocity30d

  // Scoring data (count of score >= 80 per day)
  const scoring7d  = overview?.scoring_7d  ?? []
  const scoring30d = overview?.scoring_30d ?? []

  const logs = overview?.recent_logs?.length ? overview.recent_logs : mockLogs

  const topMatches = matchesRaw?.length
    ? [...matchesRaw]
        .sort((a, b) => new Date(b.scraped_at ?? 0) - new Date(a.scraped_at ?? 0))
        .map(adaptJob)
    : mockMatches

  const refetch = useCallback(() => {
    refetchOverview()
    refetchMatches()
  }, [refetchOverview, refetchMatches])

  return {
    loading: overviewLoading || matchesLoading,
    error: overviewError ?? matchesError,
    isOffline,
    kpiCards,
    velocity7d,
    velocity30d,
    scoring7d,
    scoring30d,
    logs,
    topMatches,
    sourceStats: overview?.source_stats ?? [],
    refetch,
  }
}
