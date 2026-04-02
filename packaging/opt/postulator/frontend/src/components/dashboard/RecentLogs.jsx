import styles from './RecentLogs.module.css'

const DOT_CLASS = {
  ai:      styles.dotAi,
  scraper: styles.dotScraper,
  system:  styles.dotSystem,
}

/**
 * @param {{ logs: {id,type,message,meta}[] }} props
 * Les logs viennent maintenant du hook useDashboard.
 */
export default function RecentLogs({ logs = [] }) {
  return (
    <div className={styles.card}>
      <p className={styles.title}>Recent Logs</p>

      {logs.length === 0 ? (
        <p className={styles.empty}>Aucun événement récent.</p>
      ) : (
        <ul className={styles.list}>
          {logs.map(log => (
            <li key={log.id} className={styles.item}>
              <span className={`${styles.dot} ${DOT_CLASS[log.type] ?? styles.dotSystem}`} />
              <div className={styles.content}>
                <p className={styles.msg}>{log.message}</p>
                <p className={styles.meta}>{log.meta}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button className={`btn-ghost ${styles.auditBtn}`}>
        View Audit Trail
      </button>
    </div>
  )
}
