import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchChartData } from '../../api/dashboard.js'
import styles from './IngestionChart.module.css'

// ── Tooltip riche ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }) {
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
      <p className={styles.tooltipValue}>
        {d.jobs} offre{d.jobs !== 1 ? 's' : ''} indexée{d.jobs !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function IngestionChart({ velocity7d = [], velocity30d = [] }) {
  const [period,     setPeriod]     = useState('7d')
  const [offset,     setOffset]     = useState(0)       // 0 = période courante
  const [navData,    setNavData]    = useState(null)    // null = utiliser les props
  const [navLoading, setNavLoading] = useState(false)

  // Reset offset quand on change de période
  useEffect(() => { setOffset(0); setNavData(null) }, [period])

  // Fetch données déplacées quand offset > 0
  useEffect(() => {
    if (offset === 0) { setNavData(null); return }
    const days = period === '7d' ? 7 : 30
    setNavLoading(true)
    fetchChartData({ type: 'velocity', days, offset })
      .then(res => setNavData(res.points ?? []))
      .catch(() => setNavData([]))
      .finally(() => setNavLoading(false))
  }, [offset, period])

  const baseData = period === '7d' ? velocity7d : velocity30d
  const data     = (offset === 0 ? baseData : navData) ?? []
  const maxVal   = data.length ? Math.max(...data.map(d => d.jobs), 0) : 0

  // Label de la période affichée
  const periodLabel = () => {
    if (data.length === 0 || !data[0]?.date) return ''
    const fmt = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short',
    })
    return `${fmt(data[0].date)} – ${fmt(data[data.length - 1].date)}`
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>Ingestion Velocity</p>
          <p className={styles.sub}>
            {offset === 0 ? 'Jobs indexés par cycle de 24h' : periodLabel()}
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
        <ResponsiveContainer width="100%" height={160}>
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
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar dataKey="jobs" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.jobs === maxVal && maxVal > 0 ? '#3cddc7' : '#222a3d'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
