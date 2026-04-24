import { useState, useEffect } from 'react'
import { Mail, CheckCircle, XCircle, Loader, Settings, Shield, Brain, ExternalLink, AlertTriangle, Cloud, Palette, Zap, Save, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useAsync } from '../hooks/useAsync.js'
import { fetchAlertStatus, testSmtp } from '../api/alerts.js'
import styles from './SettingsPage.module.css'

// ── Helpers thème ─────────────────────────────────────────────────────────────
function applyTheme(theme, customColor) {
  const root = document.documentElement
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
    root.style.removeProperty('--surface')
    root.style.removeProperty('--surface-container')
    root.style.removeProperty('--surface-container-low')
  } else if (theme === 'custom' && customColor) {
    root.removeAttribute('data-theme')
    root.style.setProperty('--surface', customColor)
    root.style.setProperty('--surface-container', customColor + 'cc')
    root.style.setProperty('--surface-container-low', customColor + 'dd')
  } else {
    root.removeAttribute('data-theme')
    root.style.removeProperty('--surface')
    root.style.removeProperty('--surface-container')
    root.style.removeProperty('--surface-container-low')
  }
}

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

  // ── Thème ─────────────────────────────────────────────────────────────────
  const [theme,       setTheme]       = useState(() => localStorage.getItem('postulator_theme') || 'dark')
  const [customColor, setCustomColor] = useState(() => localStorage.getItem('postulator_custom_color') || '#1a0e3a')

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
    localStorage.setItem('postulator_theme', newTheme)
    applyTheme(newTheme, customColor)
  }

  const handleCustomColorApply = () => {
    localStorage.setItem('postulator_custom_color', customColor)
    if (theme === 'custom') applyTheme('custom', customColor)
    else handleThemeChange('custom')
  }

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

  // Statut Cloud AI (chargé via l'endpoint backend)
  const [cloudStatus, setCloudStatus] = useState(null)
  const [loadingCloud, setLoadingCloud] = useState(true)

  const reloadCloudStatus = () => {
    setLoadingCloud(true)
    fetch('/api/cv-matching/cloud-status')
      .then(r => r.json()).then(setCloudStatus)
      .catch(() => setCloudStatus({ configured: false }))
      .finally(() => setLoadingCloud(false))
  }
  useEffect(() => { reloadCloudStatus() }, [])

  // ── OpenRouter ─────────────────────────────────────────────────────────────
  const [orStatus,       setOrStatus]       = useState(null)   // {configured, masked_key, model}
  const [orKey,          setOrKey]          = useState('')
  const [orModel,        setOrModel]        = useState('deepseek/deepseek-r1:free')
  const [orShowKey,      setOrShowKey]      = useState(false)
  const [orSaving,       setOrSaving]       = useState(false)
  const [orSaveResult,   setOrSaveResult]   = useState(null)   // {ok, message}
  const [orModels,       setOrModels]       = useState([])
  const [orLoadingModels,setOrLoadingModels]= useState(false)

  const loadOrStatus = () => {
    fetch('/api/settings/openrouter')
      .then(r => r.json())
      .then(d => {
        setOrStatus(d)
        setOrModel(d.model || 'deepseek/deepseek-r1:free')
        // Auto-charger la liste des modèles dès que la clé est connue
        fetchOrModels()
      })
      .catch(() => setOrStatus({ configured: false, model: 'deepseek/deepseek-r1:free' }))
  }

  const fetchOrModels = async () => {
    setOrLoadingModels(true)
    try {
      const res  = await fetch('/api/settings/openrouter/models')
      const data = await res.json()
      setOrModels(Array.isArray(data) ? data : [])
    } catch {
      setOrModels([])
    } finally {
      setOrLoadingModels(false)
    }
  }

  useEffect(() => { loadOrStatus() }, [])

  const handleOrSave = async () => {
    setOrSaving(true)
    setOrSaveResult(null)
    try {
      const res = await fetch('/api/settings/openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: orKey, model: orModel }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Erreur sauvegarde')
      setOrSaveResult({ ok: true, message: 'Configuration sauvegardée !' })
      setOrKey('')
      loadOrStatus()
      reloadCloudStatus()
    } catch (err) {
      setOrSaveResult({ ok: false, message: err.message })
    } finally {
      setOrSaving(false)
    }
  }

  const handleOrClear = async () => {
    setOrSaving(true)
    setOrSaveResult(null)
    try {
      const res = await fetch('/api/settings/openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: '', model: orModel }),
      })
      if (!res.ok) throw new Error('Erreur')
      setOrSaveResult({ ok: true, message: 'Clé supprimée — Ollama utilisé par défaut.' })
      loadOrStatus()
      reloadCloudStatus()
    } catch (err) {
      setOrSaveResult({ ok: false, message: err.message })
    } finally {
      setOrSaving(false)
    }
  }

  const [orPinging,    setOrPinging]    = useState(false)
  const [orPingResult, setOrPingResult] = useState(null)  // {ok, model, latency_ms, error}

  const handleOrPing = async () => {
    setOrPinging(true)
    setOrPingResult(null)
    try {
      const res  = await fetch('/api/settings/openrouter/ping')
      const data = await res.json()
      setOrPingResult(data)
    } catch (err) {
      setOrPingResult({ ok: false, error: err.message })
    } finally {
      setOrPinging(false)
    }
  }

  const handleOrLoadModels = () => fetchOrModels()

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

      {/* ── OPENROUTER ── */}
      <Section
        icon={<Zap size={16} strokeWidth={2} style={{ color: orStatus?.configured ? '#f97316' : 'var(--outline)' }} />}
        title="OpenRouter (modèles gratuits)"
        subtitle="Utilisez des modèles IA gratuits en ligne pour toutes les fonctionnalités IA — remplace Ollama si configuré.">

        {/* Statut */}
        <div className={`${styles.statusBanner} ${orStatus?.configured ? styles.statusBannerOk : styles.statusBannerWarn}`}
          style={orStatus?.configured ? { borderColor: 'rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.07)', color: '#f97316' } : {}}>
          {!orStatus
            ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Chargement…</>
            : orStatus.configured
              ? <><CheckCircle size={14} strokeWidth={2} /> OpenRouter actif — modèle : <strong>{orStatus.model}</strong> · Clé : {orStatus.masked_key}</>
              : <><AlertTriangle size={14} strokeWidth={2} /> OpenRouter non configuré — Ollama (local) utilisé par défaut.</>
          }
        </div>

        {/* Formulaire de configuration */}
        <div className={styles.orForm}>
          {/* Clé API */}
          <div className={styles.orField}>
            <label className={styles.orLabel}>Clé API OpenRouter</label>
            <div className={styles.orInputRow}>
              <input
                type={orShowKey ? 'text' : 'password'}
                className={styles.orInput}
                placeholder={orStatus?.configured ? '(clé enregistrée — laissez vide pour conserver)' : 'sk-or-v1-...'}
                value={orKey}
                onChange={e => setOrKey(e.target.value)}
                autoComplete="off"
              />
              <button className={styles.orIconBtn} onClick={() => setOrShowKey(v => !v)} title={orShowKey ? 'Masquer' : 'Afficher'}>
                {orShowKey ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
              </button>
            </div>
          </div>

          {/* Modèle */}
          <div className={styles.orField}>
            <label className={styles.orLabel}>
              Modèle
              {orModels.length > 0 && (
                <span className={styles.orModelCount}>{orModels.length} modèles gratuits disponibles</span>
              )}
            </label>
            <div className={styles.orInputRow}>
              {orModels.length > 0 ? (
                <select
                  className={styles.orSelect}
                  value={orModel}
                  onChange={e => setOrModel(e.target.value)}
                >
                  {orModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name || m.id}</option>
                  ))}
                  {/* Si le modèle actuel n'est pas dans la liste, l'ajouter */}
                  {orModel && !orModels.find(m => m.id === orModel) && (
                    <option value={orModel}>{orModel}</option>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  className={styles.orInput}
                  value={orModel}
                  onChange={e => setOrModel(e.target.value)}
                  placeholder="deepseek/deepseek-r1:free"
                />
              )}
              <button
                className={styles.orIconBtn}
                onClick={handleOrLoadModels}
                disabled={orLoadingModels}
                title="Rafraîchir la liste depuis OpenRouter API">
                {orLoadingModels
                  ? <Loader size={14} className={styles.spin} strokeWidth={2} />
                  : <RefreshCw size={14} strokeWidth={2} />}
              </button>
            </div>
            {orLoadingModels && (
              <p className={styles.orHint}>Récupération des modèles gratuits depuis OpenRouter…</p>
            )}
          </div>

          {/* Boutons */}
          <div className={styles.orActions}>
            <button
              className={styles.orSaveBtn}
              onClick={handleOrSave}
              disabled={orSaving || (!orKey && !orStatus?.configured)}>
              {orSaving
                ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Sauvegarde…</>
                : <><Save size={13} strokeWidth={2} /> Sauvegarder</>}
            </button>
            {orStatus?.configured && (
              <button className={styles.orClearBtn} onClick={handleOrClear} disabled={orSaving}>
                <XCircle size={13} strokeWidth={2} /> Supprimer la clé
              </button>
            )}
          </div>

          {/* Résultat sauvegarde */}
          {orSaveResult && (
            <div className={`${styles.testResult} ${orSaveResult.ok ? styles.testResultOk : styles.testResultErr}`}>
              {orSaveResult.ok
                ? <><CheckCircle size={14} strokeWidth={2} /> {orSaveResult.message}</>
                : <><XCircle size={14} strokeWidth={2} /> {orSaveResult.message}</>}
            </div>
          )}
        </div>

        {/* Bouton test de connexion */}
        {orStatus?.configured && (
          <div className={styles.testRow}>
            <button
              className={`${styles.testBtn} ${orPinging ? styles.testBtnDisabled : ''}`}
              style={{ borderColor: '#f97316', color: '#f97316', background: 'rgba(249,115,22,0.08)' }}
              onClick={handleOrPing}
              disabled={orPinging}>
              {orPinging
                ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Test en cours…</>
                : <><Zap size={13} strokeWidth={2} /> Tester la connexion OpenRouter</>}
            </button>
          </div>
        )}
        {orPingResult && (
          <div className={`${styles.testResult} ${orPingResult.ok ? styles.testResultOk : styles.testResultErr}`}
            style={orPingResult.ok ? { borderColor: 'rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.07)', color: '#f97316' } : {}}>
            {orPingResult.ok
              ? <><CheckCircle size={14} strokeWidth={2} /> OpenRouter opérationnel · {orPingResult.model} · {orPingResult.latency_ms}ms</>
              : <><XCircle size={14} strokeWidth={2} /> {orPingResult.error}</>}
          </div>
        )}

        {/* Modèles gratuits — liste dynamique */}
        <div className={styles.envBlock}>
          <div className={styles.orModelsHeader}>
            <p className={styles.envBlockTitle}>
              {orModels.length > 0
                ? `${orModels.length} modèles gratuits disponibles — cliquez pour sélectionner`
                : 'Modèles gratuits OpenRouter'}
            </p>
            <button
              className={styles.orRefreshSmall}
              onClick={handleOrLoadModels}
              disabled={orLoadingModels}
              title="Rafraîchir depuis OpenRouter API">
              {orLoadingModels
                ? <Loader size={12} className={styles.spin} strokeWidth={2} />
                : <RefreshCw size={12} strokeWidth={2} />}
              {orLoadingModels ? 'Chargement…' : 'Rafraîchir'}
            </button>
          </div>

          {orModels.length > 0 ? (
            <div className={styles.orModelsList}>
              {orModels.map(m => (
                <div
                  key={m.id}
                  className={`${styles.orModelItem} ${orModel === m.id ? styles.orModelItemActive : ''}`}
                  onClick={() => setOrModel(m.id)}
                  title={m.id}
                >
                  <span className={styles.orModelItemName}>{m.name || m.id}</span>
                  <span className={styles.orModelItemId}>{m.id}</span>
                  {m.context && m.context !== '?' && (
                    <span className={styles.orModelItemCtx}>{Number(m.context).toLocaleString()} ctx</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.orHint}>
              {orLoadingModels
                ? 'Récupération en cours…'
                : 'Cliquez sur Rafraîchir pour charger les modèles gratuits depuis l\'API OpenRouter.'}
            </p>
          )}

          <p className={styles.envBlockNote}>
            💡 <strong>Gratuit sans limite de tokens</strong> avec les modèles <code>:free</code>.
            Les modèles disponibles évoluent dans le temps — rafraîchissez pour voir la liste à jour.{' '}
            Obtenez votre clé gratuite sur{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className={styles.link}>
              openrouter.ai/keys <ExternalLink size={11} strokeWidth={2} />
            </a>
          </p>
        </div>
      </Section>

      {/* ── CLOUD AI ── */}
      <Section
        icon={<Cloud size={16} strokeWidth={2} style={{ color: cloudStatus?.configured && cloudStatus?.provider !== 'openrouter' ? '#a78bfa' : 'var(--outline)' }} />}
        title="Cloud AI (CV ATS CLOUD)"
        subtitle="Utilisez Claude ou ChatGPT pour générer des CVs ATS sans GPU — idéal sur PC sans carte graphique.">

        {/* Statut */}
        <div className={`${styles.statusBanner} ${cloudStatus?.configured ? styles.statusBannerOk : styles.statusBannerWarn}`}
          style={cloudStatus?.configured ? { borderColor: 'rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.06)', color: '#a78bfa' } : {}}>
          {loadingCloud
            ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Vérification…</>
            : cloudStatus?.configured
              ? <><CheckCircle size={14} strokeWidth={2} /> Provider actif : <strong>{cloudStatus.provider === 'anthropic' ? 'Anthropic Claude' : 'OpenAI GPT'}</strong> — modèle {cloudStatus.model}</>
              : <><AlertTriangle size={14} strokeWidth={2} /> Aucune clé API Cloud configurée — le bouton CV ATS CLOUD est désactivé.</>
          }
        </div>

        <div className={styles.fieldGroup}>
          <p className={styles.fieldGroupLabel}>Configuration (lecture seule — modifiable dans <code>backend/.env</code>)</p>
          <ConfigField
            label="ANTHROPIC_API_KEY"
            value={cloudStatus?.provider === 'anthropic' ? '(configuré)' : ''}
            masked
            hint="Claude Haiku 4.5 — rapide, économique (~$0.001/appel)"
          />
          <ConfigField
            label="OPENAI_API_KEY"
            value={cloudStatus?.provider === 'openai' ? '(configuré)' : ''}
            masked
            hint="GPT-4o-mini — rapide, économique (~$0.001/appel)"
          />
          <ConfigField
            label="MISTRAL_API_KEY"
            value={cloudStatus?.provider === 'mistral' ? '(configuré)' : ''}
            masked
            hint="mistral-small-latest — modèle français, rapide, économique"
          />
        </div>

        <div className={styles.envBlock}>
          <p className={styles.envBlockTitle}>Comment configurer ?</p>
          <p className={styles.envBlockText}>Ajoutez l'une des clés suivantes dans <code>backend/.env</code> :</p>
          <pre className={styles.envPre}>{`# Option 1 : Anthropic Claude (priorité 1)
ANTHROPIC_API_KEY=sk-ant-...

# Option 2 : OpenAI (priorité 2)
OPENAI_API_KEY=sk-...

# Option 3 : Mistral AI (priorité 3, modèle français)
MISTRAL_API_KEY=...`}</pre>
          <p className={styles.envBlockNote}>
            💡 Priorité : <strong>Anthropic</strong> &gt; <strong>OpenAI</strong> &gt; <strong>Mistral</strong> si plusieurs clés sont renseignées.
            Redémarrez uvicorn après modification.<br />
            Obtenir une clé :{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className={styles.link}>
              Anthropic <ExternalLink size={11} strokeWidth={2} />
            </a>
            {' · '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className={styles.link}>
              OpenAI <ExternalLink size={11} strokeWidth={2} />
            </a>
            {' · '}
            <a href="https://console.mistral.ai/home" target="_blank" rel="noreferrer" className={styles.link}>
              Mistral AI 🇫🇷 <ExternalLink size={11} strokeWidth={2} />
            </a>
          </p>
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

      {/* ── APPARENCE ── */}
      <Section
        icon={<Palette size={16} strokeWidth={2} style={{ color: theme === 'dark' ? 'var(--outline)' : theme === 'light' ? 'var(--primary)' : '#a855f7' }} />}
        title="Apparence"
        subtitle="Choisissez le thème de l'interface — sombre, clair ou personnalisé.">

        <div className={styles.themeRow}>
          {/* Sombre (défaut) */}
          <div
            className={`${styles.themeCard} ${theme === 'dark' ? styles.themeCardActive : ''}`}
            onClick={() => handleThemeChange('dark')}
          >
            <div className={`${styles.themePreview} ${styles.themePreviewDark}`} />
            <div>
              <p className={styles.themeCardLabel}>Sombre</p>
              <p className={styles.themeCardSub}>Défaut — fond bleu nuit</p>
            </div>
          </div>

          {/* Clair */}
          <div
            className={`${styles.themeCard} ${theme === 'light' ? styles.themeCardActive : ''}`}
            onClick={() => handleThemeChange('light')}
          >
            <div className={`${styles.themePreview} ${styles.themePreviewLight}`} />
            <div>
              <p className={styles.themeCardLabel}>Clair</p>
              <p className={styles.themeCardSub}>Fond blanc-bleuté</p>
            </div>
          </div>

          {/* Personnalisé */}
          <div
            className={`${styles.themeCard} ${theme === 'custom' ? styles.themeCardActive : ''}`}
            onClick={() => handleThemeChange('custom')}
          >
            <div
              className={styles.themePreview}
              style={{ background: `linear-gradient(135deg, ${customColor} 60%, #a855f7 100%)` }}
            />
            <div>
              <p className={styles.themeCardLabel}>Personnalisé</p>
              <p className={styles.themeCardSub}>Couleur de fond libre</p>
            </div>
          </div>
        </div>

        {/* Sélecteur de couleur (toujours visible, appliqué au mode custom) */}
        <div className={styles.colorPickerRow}>
          <p className={styles.colorPickerLabel}>
            Couleur de fond personnalisée
            {theme !== 'custom' && <span style={{ opacity: 0.6 }}> — activez le mode "Personnalisé" pour l'appliquer</span>}
          </p>
          <input
            className={styles.colorInput}
            type="color"
            value={customColor}
            onChange={e => setCustomColor(e.target.value)}
          />
          <button className={styles.themeApplyBtn} onClick={handleCustomColorApply}>
            Appliquer
          </button>
        </div>
      </Section>

    </div>
  )
}
