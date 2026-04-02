import { useEffect, useState } from 'react'
import { X, Save, CheckCircle, XCircle, Loader, Mail, Send } from 'lucide-react'
import { useAsync }        from '../../hooks/useAsync.js'
import { fetchOllamaModels } from '../../api/analysis.js'
import { fetchAlertStatus, testSmtp } from '../../api/alerts.js'
import { useProfile }      from '../../hooks/useProfile.js'
import styles from './Drawer.module.css'

export default function SettingsDrawer({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const { data: modelsData }  = useAsync(fetchOllamaModels, [], { fallback: null })
  const { data: alertStatus } = useAsync(fetchAlertStatus,  [], { fallback: null })
  const { profile, save, saving } = useProfile()

  const [threshold, setThreshold] = useState(80)
  const [saved,     setSaved]     = useState(false)

  // Test SMTP
  const [testLoading, setTestLoading] = useState(false)
  const [testResult,  setTestResult]  = useState(null)

  useEffect(() => {
    if (profile) setThreshold(profile.alert_score_threshold ?? 80)
  }, [profile])

  const handleSave = async () => {
    await save({ alert_score_threshold: threshold })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestSmtp = async () => {
    setTestLoading(true); setTestResult(null)
    try {
      const res = await testSmtp()
      setTestResult(res)
    } catch (err) {
      setTestResult({ ok: false, error: err.detail ?? err.message })
    } finally { setTestLoading(false) }
  }

  if (!open) return null

  const emailOk = alertStatus?.email_configured

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerRight}`}>
        <div className={styles.header}>
          <h2 className={styles.title}>Paramètres</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} strokeWidth={2} /></button>
        </div>

        {/* ── Ollama ── */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Ollama — IA locale</p>
          <div className={styles.settingRow}>
            <span className={styles.settingKey}>Modèle actif</span>
            <span className={styles.settingVal}>{modelsData?.current ?? '—'}</span>
          </div>
          <div className={styles.settingRow}>
            <span className={styles.settingKey}>Modèles installés</span>
            <span className={styles.settingVal}>{modelsData?.models?.join(', ') ?? '—'}</span>
          </div>
          <div className={styles.settingRow}>
            <span className={styles.settingKey}>Statut</span>
            <span className={styles.settingVal} style={{ color: modelsData ? 'var(--tertiary)' : 'var(--error)', display: 'flex', alignItems: 'center', gap: 5 }}>
              {modelsData
                ? <><CheckCircle size={12} strokeWidth={2} /> Online</>
                : <><XCircle    size={12} strokeWidth={2} /> Offline</>
              }
            </span>
          </div>
          <p className={styles.settingHint}>
            Pour changer de modèle : modifier <code>OLLAMA_MODEL</code> dans <code>backend/.env</code> et redémarrer l'API.
          </p>
        </section>

        {/* ── Alertes — seuil ── */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Alertes — Seuil de score</p>
          <div className={styles.settingRow}>
            <span className={styles.settingKey}>Score minimum</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range" min={50} max={100} step={5}
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                style={{ width: 100, accentColor: 'var(--primary)' }}
              />
              <span className={styles.settingVal} style={{ color: 'var(--primary)', fontWeight: 700, minWidth: 40 }}>
                {threshold}%
              </span>
            </div>
          </div>
          <p className={styles.settingHint}>
            Les matches au-dessus de ce seuil apparaissent dans les alertes et déclenchent un email si SMTP est configuré.
          </p>
          <button className="btn-ghost" onClick={handleSave} disabled={saving}
            style={{ marginTop: 8, fontSize: 12, gap: 6, display: 'flex', alignItems: 'center' }}>
            <Save size={12} strokeWidth={2} />
            {saved ? 'Sauvegardé ✓' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </section>

        {/* ── Alertes — email SMTP ── */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>
            <Mail size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 5 }} />
            Alertes email (SMTP)
          </p>

          {/* Statut configuration */}
          <div className={styles.settingRow}>
            <span className={styles.settingKey}>Configuration</span>
            <span className={styles.settingVal} style={{ color: emailOk ? 'var(--tertiary)' : 'var(--outline)', display: 'flex', alignItems: 'center', gap: 5 }}>
              {emailOk
                ? <><CheckCircle size={12} strokeWidth={2} /> Configuré</>
                : <><XCircle    size={12} strokeWidth={2} /> Non configuré</>
              }
            </span>
          </div>

          {emailOk && alertStatus && (
            <>
              <div className={styles.settingRow}>
                <span className={styles.settingKey}>Serveur</span>
                <span className={styles.settingVal}>{alertStatus.smtp_host}:{alertStatus.smtp_port}</span>
              </div>
              <div className={styles.settingRow}>
                <span className={styles.settingKey}>Expéditeur</span>
                <span className={styles.settingVal}>{alertStatus.smtp_user}</span>
              </div>
              <div className={styles.settingRow}>
                <span className={styles.settingKey}>Destinataire</span>
                <span className={styles.settingVal}>{alertStatus.alert_email_to}</span>
              </div>
            </>
          )}

          {!emailOk && (
            <p className={styles.settingHint}>
              Pour activer les alertes email, configurez dans <code>backend/.env</code> :<br />
              <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code>, <code>ALERT_EMAIL_TO</code>
            </p>
          )}

          {/* Bouton test SMTP */}
          {emailOk && (
            <div style={{ marginTop: 10 }}>
              <button className="btn-ghost" onClick={handleTestSmtp} disabled={testLoading}
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                {testLoading
                  ? <><Loader size={12} className={styles.spin} strokeWidth={2} /> Test en cours…</>
                  : <><Send size={12} strokeWidth={2} /> Envoyer un email de test</>
                }
              </button>

              {testResult && (
                <div style={{
                  marginTop: 8, padding: '8px 10px', borderRadius: 6, fontSize: 11,
                  background: testResult.ok ? 'rgba(60,221,199,0.1)' : 'rgba(255,180,171,0.1)',
                  border: `1px solid ${testResult.ok ? 'rgba(60,221,199,0.3)' : 'rgba(255,180,171,0.3)'}`,
                  color: testResult.ok ? 'var(--tertiary)' : 'var(--error)',
                  display: 'flex', alignItems: 'flex-start', gap: 6,
                }}>
                  {testResult.ok
                    ? <><CheckCircle size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />{testResult.message}</>
                    : <><XCircle    size={12} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />{testResult.error}</>
                  }
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Infos système ── */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Application</p>
          <div className={styles.settingRow}>
            <span className={styles.settingKey}>Version</span>
            <span className={styles.settingVal}>Postulator v0.1.0</span>
          </div>
          <div className={styles.settingRow}>
            <span className={styles.settingKey}>Backend</span>
            <span className={styles.settingVal}>FastAPI · SQLite · Celery</span>
          </div>
          <div className={styles.settingRow}>
            <span className={styles.settingKey}>Licence</span>
            <span className={styles.settingVal}>MIT — Open Source</span>
          </div>
        </section>
      </aside>
    </>
  )
}
