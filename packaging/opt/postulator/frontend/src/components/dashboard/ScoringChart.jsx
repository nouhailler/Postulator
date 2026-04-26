import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchChartData } from '../../api/dashboard.js'
import styles from './ScoringChart.module.css'

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ScoringTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const dateLabel = d.date
    ? new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
    : d.day
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipDate}>{dateLabel}</p>
      <p className={styles.tooltipCount}>
        {d.count} offre{d.count !== 1 ? 's' : ''} ≥ 80%
      </p>
      {d.count > 0 && d.avg_score > 0 && (
        <p className={styles.tooltipAvg}>Score moyen : {d.avg_score}%</p>
      )}
    </div>
  )
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function ScoringChart({ scoring7d = [], scoring30d = [] }) {
  const [period,     setPeriod]     = useState('7d')
  const [offset,     setOffset]     = useState(0)
  const [navData,    setNavData]    = useState(null)
  const [navLoading, setNavLoading] = useState(false)

  useEffect(() => { setOffset(0); setNavData(null) }, [period])

  useEffect(() => {
    if (offset === 0) { setNavData(null); return }
    const days = period === '7d' ? 7 : 30
    setNavLoading(true)
    fetchChartData({ type: 'scoring', days, offset })
      .then(res => setNavData(res.points ?? []))
      .catch(() => setNavData([]))
      .finally(() => setNavLoading(false))
  }, [offset, period])

  const baseData = period === '7d' ? scoring7d : scoring30d
  const data     = (offset === 0 ? baseData : navData) ?? []
  const maxVal   = data.length ? Math.max(...data.map(d => d.count), 0) : 0

  const periodLabel = () => {
    if (data.length === 0 || !data[0]?.date) return ''
    const fmt = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short',
    })
    return `${fmt(data[0].date)} – ${fmt(data[data.length - 1].date)}`
  }

  const totalCount = data.reduce((s, d) => s + (d.count ?? 0), 0)

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>Score ≥ 80% / Jour</p>
          <p className={styles.sub}>
            {offset === 0
              ? `Offres fortement recommandées par l'IA · ${totalCount} sur la période`
              : periodLabel()}
          </p>
        </div>
        <div className={styles.controls}>
          <div className={styles.periods}>
            {['7d', '30d'].map(p => (
              <button
                key={p}
                className={`${styles.periodBtn} ${period === p ? styles.active : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <div className={styles.navBtns}>
            <button
              className={styles.navBtn}
              onClick={() => setOffset(o => o + 1)}
              title="Période précédente"
            >
              <ChevronLeft size={12} strokeWidth={2.5} />
            </button>
            <button
              className={styles.navBtn}
              onClick={() => setOffset(o => Math.max(0, o - 1))}
              disabled={offset === 0}
              title="Période suivante"
            >
              <ChevronRight size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {navLoading ? (
        <div className={styles.empty}>Chargement…</div>
      ) : data.length === 0 ? (
        <div className={styles.empty}>Aucune donnée pour cette période.</div>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart
            data={data}
            barCategoryGap="28%"
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <XAxis
              dataKey="day"
              tick={{ fill: '#88929b', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#88929b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<ScoringTooltip />}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.count === maxVal && maxVal > 0
                      ? '#7bd0ff'
                      : entry.count > 0
                        ? 'rgba(123,208,255,0.35)'
                        : '#1a2133'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
