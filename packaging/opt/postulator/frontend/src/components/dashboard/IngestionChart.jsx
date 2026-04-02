import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import styles from './IngestionChart.module.css'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipValue}>{payload[0].value} jobs</p>
    </div>
  )
}

/**
 * @param {{ velocity7d: {day:string,jobs:number}[], velocity30d: {day:string,jobs:number}[] }} props
 * Les données viennent maintenant du hook useDashboard (API ou mock fallback).
 */
export default function IngestionChart({ velocity7d = [], velocity30d = [] }) {
  const [period, setPeriod] = useState('7d')
  const data    = period === '7d' ? velocity7d : velocity30d
  const maxVal  = data.length ? Math.max(...data.map(d => d.jobs)) : 0

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>Ingestion Velocity</p>
          <p className={styles.sub}>Jobs indexés par cycle de 24h</p>
        </div>
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
      </div>

      {data.length === 0 ? (
        <div className={styles.empty}>Aucune donnée pour cette période.</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} barCategoryGap="28%" margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="jobs" radius={[3, 3, 0, 0]}>
              {data.map(entry => (
                <Cell
                  key={entry.day}
                  fill={entry.jobs === maxVal ? '#3cddc7' : '#222a3d'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
