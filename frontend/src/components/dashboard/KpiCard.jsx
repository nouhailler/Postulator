import { BarChart2, Zap, Cpu, Clock } from 'lucide-react'
import styles from './KpiCard.module.css'

const ICONS = {
  chart: BarChart2,
  bolt:  Zap,
  cpu:   Cpu,
  clock: Clock,
}

/**
 * @param {{ loading?: boolean }} props  — affiche un shimmer si loading=true
 */
export default function KpiCard({
  label, value, sub, subType = 'neutral', icon, highlight = false, loading = false,
}) {
  const Icon = ICONS[icon] ?? BarChart2

  return (
    <div className={`${styles.card} ${loading ? styles.shimmer : ''}`}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <Icon
          size={14}
          strokeWidth={1.8}
          className={highlight ? styles.iconHighlight : styles.icon}
        />
      </div>

      <div className={`${styles.value} ${highlight ? styles.valueHighlight : ''}`}>
        {loading ? <span className={styles.skeletonValue} /> : value}
      </div>

      <div className={styles.sub}>
        {!loading && subType === 'positive' && (
          <><span className={styles.arrow}>▲</span><span className={styles.positive}>{sub}</span></>
        )}
        {!loading && subType === 'ai' && (
          <span className={styles.ai}>✦ {sub}</span>
        )}
        {!loading && subType === 'neutral' && (
          <><span className={styles.dot} /><span className={styles.muted}>{sub}</span></>
        )}
      </div>
    </div>
  )
}
