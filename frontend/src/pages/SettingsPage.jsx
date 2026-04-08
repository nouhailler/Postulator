import { useState } from 'react'
import { Mail, CheckCircle, XCircle, Loader, Bell, Settings, Shield, Brain, ExternalLink, AlertTriangle } from 'lucide-react'
import { useAsync } from '../hooks/useAsync.js'
import { fetchAlertStatus, testSmtp } from '../api/alerts.js'
import styles from './SettingsPage.module.css'

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ icon, title, subtitle, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionIconWrap}>{icon}</div>
        <div>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {subtitle && <p className={styles.sectionSub}>{subtitle}</p>}
        </div>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  )
}

// ── Champ affiché en lecture seule ────────────────────────────────────────────
function ConfigField({ label, value, masked, hint }) {
  const display = masked && value ? '••••••••' : (value || '—')
  const isEmpty = !value
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.fieldValue} ${isEmpty ? styles.fieldEmpty : ''}`}>{display}</span>
      {hint && <span className={styles.fieldHint}>{hint}</span>}
    </div>
  )
}

export default function SettingsPage() {
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState(null)   // { ok, message, error }

  const { data: alertStatus, loading } = useAsync(fetchAlertStatus, [], { fallback: null })

  const handleTestSmtp = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testSmtp()
      setTestResult(res)
    } catch (err) {
      setTestResult({ ok: false, error: err.detail ?? err.message ?? 'Erreur inconnue' })
    } finally {
      setTesting(false)
    }
  }

  const emailOk = alertStatus?.email_configured

  return (
    <div className={styles.page}>

      {/* En-tête */}
      <div className={styles.pageHeader}>
        <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>Paramètres</h1>
        <p className={styles.pageSub}>Configuration de Postulator — alertes, IA, scrapers.</p>
      </div>

      {/* ── ALERTES EMAIL ── */}
      <Section
        icon={<Mail size={16} strokeWidth={2} style={{ color: emailOk ? 'var(--tertiary)' : 'var(--outline)' }} />}
        title="Alertes email"
        subtitle="Recevez un email automatique quand un match IA dépasse votre seuil de score.">

        {/* Statut global */}
        <div className={`${styles.statusBanner} ${emailOk ? styles.statusBannerOk : styles.statusBannerWarn}`}>
          {emailOk
            ? <><CheckCircle size={14} strokeWidth={2} /> Configuration SMTP active — les alertes sont opérationnelles.</>
            : <><AlertTriangle size={14} strokeWidth={2} /> Configuration SMTP incomplète — les alertes email sont désactivées.</>
          }
        </div>

        {/* Valeurs actuelles */}
        <div className={styles.fieldGroup}>
          <p className={styles.fieldGroupLabel}>Configuration actuelle (lecture seule — modifiable dans <code>backend/.env</code>)</p>
          {loading
            ? <div className={styles.loadingRow}><Loader size={13} className={styles.spin} strokeWidth={2} /> Chargement…</div>
            : <>
                <ConfigField label="SMTP_HOST" value={alertStatus?.smtp_host} hint="Ex : smtp.gmail.com, mail.protonmail.ch" />
                <ConfigField label="SMTP_PORT" value={alertStatus?.smtp_port?.toString()} hint="587 (TLS) ou 465 (SSL)" />
                <ConfigField label="SMTP_USER" value={alertStatus?.smtp_user} hint="Votre adresse email expéditeur" />
                <ConfigField label="SMTP_PASSWORD" value={alertStatus?.smtp_user ? '(configuré)' : ''} masked hint="Mot de passe ou mot de passe d'application" />
                <ConfigField label="ALERT_EMAIL_TO" value={alertStatus?.alert_email_to} hint="Adresse de destination des alertes" />
                <ConfigField label="ALERT_SCORE_THRESHOLD" value={alertStatus?.score_threshold?.toString()} hint="Score minimum (%) pour déclencher une alerte" />
              </>
          }
        </div>

        {/* Instructions .env */}
        <div className={styles.envBlock}>
          <p className={styles.envBlockTitle}>Comment configurer ?</p>
          <p className={styles.envBlockText}>Éditez <code>backend/.env</code> et renseignez :</p>
          <pre className={styles.envPre}>{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre@email.com
SMTP_PASSWORD=votre_mot_de_passe_app
ALERT_EMAIL_TO=alertes@email.com
ALERT_SCORE_THRESHOLD=80`}</pre>
          <p className={styles.envBlockNote}>
            💡 Pour Gmail, créez un <strong>mot de passe d'application</strong> dans votre compte Google
            (Sécurité → Validation en deux étapes → Mots de passe d'application).
            Redémarrez uvicorn après modification.
          </p>
        </div>

        {/* Bouton test */}
        <div className={styles.testRow}>
          <button
            className={`${styles.testBtn} ${!emailOk || testing ? styles.testBtnDisabled : ''}`}
            onClick={handleTestSmtp}
            disabled={!emailOk || testing}>
            {testing
              ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Test en cours…</>
              : <><Mail size={13} strokeWidth={2} /> Tester la connexion SMTP</>
            }
          </button>
          {!emailOk && <span className={styles.testHint}>Configurez d'abord les paramètres SMTP dans .env</span>}
        </div>

        {/* Résultat test */}
        {testResult && (
          <div className={`${styles.testResult} ${testResult.ok ? styles.testResultOk : styles.testResultErr}`}>
            {testResult.ok
              ? <><CheckCircle size={14} strokeWidth={2} /> {testResult.message}</>
              : <><XCircle size={14} strokeWidth={2} /> {testResult.error}</>
            }
          </div>
        )}
      </Section>

      {/* ── OLLAMA / IA ── */}
      <Section
        icon={<Brain size={16} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />}
        title="Intelligence Artificielle (Ollama)"
        subtitle="Modèle local utilisé pour le scoring, les résumés et l'analyse de CV.">

        <div className={styles.fieldGroup}>
          <p className={styles.fieldGroupLabel}>Configuration actuelle (modifiable dans <code>backend/.env</code>)</p>
          <ConfigField label="OLLAMA_BASE_URL" value="http://localhost:11434" hint="URL du serveur Ollama local" />
          <ConfigField label="OLLAMA_MODEL" value={alertStatus ? 'voir .env' : '—'} hint="Ex : phi4-mini, qwen2.5:14b, deepseek-r1:32b" />
        </div>

        <div className={styles.envBlock}>
          <p className={styles.envBlockTitle}>Modèles recommandés pour une configuration avec 16GB de VRAM</p>
          <div className={styles.modelGrid}>
            {[
              { name: 'phi4-mini',        speed: '~120 t/s', usage: 'Scoring rapide' },
              { name: 'qwen2.5:14b',      speed: '~45 t/s',  usage: 'Analyse qualitative' },
              { name: 'deepseek-r1:32b',  speed: '~20 t/s',  usage: 'Raisonnement avancé' },
            ].map(m => (
              <div key={m.name} className={styles.modelCard}>
                <code className={styles.modelName}>{m.name}</code>
                <span className={styles.modelSpeed}>{m.speed}</span>
                <span className={styles.modelUsage}>{m.usage}</span>
              </div>
            ))}
          </div>
          <pre className={styles.envPre}>{`OLLAMA_MODEL=phi4-mini`}</pre>
        </div>
      </Section>

      {/* ── SCRAPERS ── */}
      <Section
        icon={<Settings size={16} strokeWidth={2} style={{ color: 'var(--outline)' }} />}
        title="Scrapers & Sources"
        subtitle="Paramètres de scraping — délais anti-blocage, proxies.">

        <div className={styles.fieldGroup}>
          <ConfigField label="Sources actives" value="Indeed · LinkedIn · Glassdoor · ZipRecruiter · Adzuna · Jobup.ch · Jobs.ch · JobTeaser" />
          <ConfigField label="Délai anti-blocage" value="3–10 secondes" hint="Entre chaque scraping (aléatoire)" />
        </div>

        <div className={styles.envBlock}>
          <p className={styles.envBlockTitle}>Adzuna API (optionnel)</p>
          <pre className={styles.envPre}>{`ADZUNA_APP_ID=votre_app_id
ADZUNA_APP_KEY=votre_app_key`}</pre>
          <p className={styles.envBlockNote}>
            Inscription gratuite sur{' '}
            <a href="https://developer.adzuna.com/" target="_blank" rel="noreferrer" className={styles.link}>
              developer.adzuna.com <ExternalLink size={11} strokeWidth={2} />
            </a>
            {' '}— 10 000 requêtes/mois. Supporte UK, US, DE, FR, AU, CA, NL, AT, BE, IT, PL, SG.
          </p>
        </div>
      </Section>

      {/* ── PROXIES ── */}
      <Section
        icon={<Shield size={16} strokeWidth={2} style={{ color: 'var(--outline)' }} />}
        title="Proxies résidentiels"
        subtitle="Protégez votre IP lors du scraping — configurés directement dans l'interface Scrapers.">

        <div className={styles.infoBox}>
          <p>Les proxies se configurent dans la page <strong>Scrapers</strong>, zone "Lancer le scraping avec Proxy".</p>
          <p style={{ marginTop: 6 }}>Format : <code>IP:PORT:USER:PASSWORD</code> — un par ligne.</p>
          <p style={{ marginTop: 6 }}>Ils ne sont pas persistés dans <code>.env</code> — à rentrer à chaque session.</p>
        </div>
      </Section>

    </div>
  )
}
