import { useEffect, useRef, useState } from 'react'
import {
  Zap, Play, StopCircle, Save, Trash2, Loader,
  CheckCircle, XCircle, AlertCircle, AlertTriangle, X,
  Clock, Calendar, Shield, Wifi, WifiOff, ExternalLink,
  ChevronDown, ChevronUp, Info, FileText, Search,
} from 'lucide-react'
import { useAsync } from '../hooks/useAsync.js'
import { fetchCVList } from '../api/cvStore.js'
import {
  fetchAutomationConfig, saveAutomationConfig, deleteAutomationConfig,
  fetchAutomationStatus, runAutomationNow, cancelAutomation,
} from '../api/automation.js'
import styles from './AutomationPage.module.css'

// ── Constantes localisation (reprises de ScrapersPage) ─────────────────────
const COUNTRIES = [
  { value: 'France',               label: '🇫🇷 France',               favorite: true },
  { value: 'Switzerland',          label: '🇨🇭 Suisse',               favorite: true },
  { value: 'Germany',              label: '🇩🇪 Allemagne' },
  { value: 'Belgium',              label: '🇧🇪 Belgique' },
  { value: 'Spain',                label: '🇪🇸 Espagne' },
  { value: 'Netherlands',          label: '🇳🇱 Pays-Bas' },
  { value: 'Italy',                label: '🇮🇹 Italie' },
  { value: 'Portugal',             label: '🇵🇹 Portugal' },
  { value: 'Sweden',               label: '🇸🇪 Suède' },
  { value: 'Denmark',              label: '🇩🇰 Danemark' },
  { value: 'Norway',               label: '🇳🇴 Norvège' },
  { value: 'Finland',              label: '🇫🇮 Finlande' },
  { value: 'Austria',              label: '🇦🇹 Autriche' },
  { value: 'Poland',               label: '🇵🇱 Pologne' },
  { value: 'Luxembourg',           label: '🇱🇺 Luxembourg' },
  { value: 'Ireland',              label: '🇮🇪 Irlande' },
  { value: 'United Kingdom',       label: '🇬🇧 Royaume-Uni' },
  { value: 'United States',        label: '🇺🇸 États-Unis' },
  { value: 'Canada',               label: '🇨🇦 Canada' },
  { value: 'Australia',            label: '🇦🇺 Australie' },
  { value: 'Singapore',            label: '🇸🇬 Singapour' },
]

const CITY_SUGGESTIONS = {
  'France':        ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes', 'Lille', 'Strasbourg'],
  'Switzerland':   ['Zürich', 'Genève', 'Basel', 'Bern', 'Lausanne', 'Zug', 'Lugano'],
  'Germany':       ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Köln', 'Stuttgart'],
  'Belgium':       ['Bruxelles', 'Anvers', 'Gand', 'Liège'],
  'United Kingdom':['London', 'Manchester', 'Birmingham', 'Edinburgh'],
  'Netherlands':   ['Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht'],
  'Luxembourg':    ['Luxembourg'],
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 15, 30, 45]

function countValidProxies(text) {
  return text.split('\n').filter(line => {
    const parts = line.trim().split(':')
    return parts.length === 4 && parts.every(p => p.trim().length > 0)
  }).length
}

function parseProxyLines(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l && l.split(':').length === 4)
}

function buildLocation(country, city) {
  if (!country) return null
  return city.trim() ? `${city.trim()}, ${country}` : country
}

function scoreColor(score) {
  if (score === null || score === undefined) return 'var(--outline)'
  if (score >= 80) return '#3cddc7'
  if (score >= 60) return '#7bd0ff'
  if (score >= 40) return '#f9c74f'
  return '#ff6b6b'
}

// ── Modal de confirmation de lancement ───────────────────────────────────────
function LaunchConfirmModal({ config, onConfirm, onCancel }) {
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <Zap size={20} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
          <h2 className={styles.modalTitle}>Lancer l'automatisation</h2>
          <button className={styles.modalClose} onClick={onCancel}><X size={16} strokeWidth={2} /></button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalText}>
            Postulator va rechercher des offres <strong>une fois par jour</strong> et scorer automatiquement les résultats.
          </p>
          <div className={styles.modalInfoGrid}>
            <div className={styles.modalInfoRow}>
              <Search size={12} strokeWidth={2} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span>Mots-clés : <strong>{config.keywords}</strong></span>
            </div>
            {config.location && (
              <div className={styles.modalInfoRow}>
                <span style={{ color: 'var(--outline)', fontSize: 11 }}>📍</span>
                <span>Localisation : <strong>{config.location}</strong></span>
              </div>
            )}
            <div className={styles.modalInfoRow}>
              <Clock size={12} strokeWidth={2} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span>Heure de lancement : <strong>{String(config.run_hour).padStart(2,'0')}:{String(config.run_minute).padStart(2,'0')}</strong> (Europe/Paris)</span>
            </div>
            <div className={styles.modalInfoRow}>
              <Calendar size={12} strokeWidth={2} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span>
                Période : <strong>
                  {config.start_date || 'Dès maintenant'}
                  {config.end_date ? ` → ${config.end_date}` : ' (sans date de fin)'}
                </strong>
              </span>
            </div>
            <div className={styles.modalInfoRow}>
              <FileText size={12} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
              <span>CV de scoring : <strong>{config.cv_name}</strong></span>
            </div>
          </div>
          <p className={styles.modalFootnote}>
            Sources : <strong>Indeed + LinkedIn uniquement</strong> · 10 offres/source · Offres du jour (24h)
          </p>
        </div>
        <div className={styles.modalFooter}>
          <button className="btn-ghost" onClick={onCancel}>Annuler</button>
          <button className={styles.modalConfirmBtn} onClick={onConfirm}>
            <Zap size={13} strokeWidth={2} />
            Activer l'automatisation
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rapport de résultats ──────────────────────────────────────────────────────
function RunReport({ status }) {
  const results = status.score_results || []
  const sorted  = [...results].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const scrape  = status.scrape_result

  const totalNew  = scrape?.sources ? scrape.sources.reduce((s, x) => s + (x.new ?? 0), 0) : 0
  const scored    = results.filter(r => r.score !== null).length
  const errored   = results.filter(r => r.error).length
  const topScore  = results.length ? Math.max(...results.filter(r=>r.score!==null).map(r=>r.score), 0) : 0

  return (
    <div className={styles.reportCard}>
      <div className={styles.reportHeader}>
        <CheckCircle size={16} strokeWidth={2} style={{ color: '#3cddc7' }} />
        <span className={styles.reportTitle}>Rapport du dernier run</span>
        {status.finished_at && (
          <span className={styles.reportDate}>
            {new Date(status.finished_at).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
          </span>
        )}
      </div>

      {/* Métriques rapides */}
      <div className={styles.reportStats}>
        <div className={styles.reportStat}>
          <span className={styles.reportStatVal} style={{ color: 'var(--primary)' }}>{totalNew}</span>
          <span className={styles.reportStatLabel}>offres trouvées</span>
        </div>
        <div className={styles.reportStat}>
          <span className={styles.reportStatVal} style={{ color: 'var(--tertiary)' }}>{scored}</span>
          <span className={styles.reportStatLabel}>scorées</span>
        </div>
        {topScore > 0 && (
          <div className={styles.reportStat}>
            <span className={styles.reportStatVal} style={{ color: scoreColor(topScore) }}>{topScore}%</span>
            <span className={styles.reportStatLabel}>meilleur score</span>
          </div>
        )}
        {errored > 0 && (
          <div className={styles.reportStat}>
            <span className={styles.reportStatVal} style={{ color: '#ff6b6b' }}>{errored}</span>
            <span className={styles.reportStatLabel}>erreurs</span>
          </div>
        )}
      </div>

      {/* Sources scraping */}
      {scrape?.sources?.length > 0 && (
        <div className={styles.reportSources}>
          {scrape.sources.map((s, i) => (
            <div key={i} className={styles.reportSourceRow}>
              <span className={styles.reportSourceName}>{s.source}</span>
              <span style={{ color: 'var(--tertiary)', fontSize: 11 }}>+{s.new ?? 0} nouvelles</span>
              <span style={{ color: 'var(--outline)', fontSize: 11 }}>{s.found ?? 0} trouvées</span>
              {s.error && <AlertCircle size={10} strokeWidth={2} style={{ color: 'var(--error)' }} title={s.error} />}
            </div>
          ))}
        </div>
      )}

      {/* Tableau des scores */}
      {sorted.length > 0 && (
        <div className={styles.reportTable}>
          <div className={styles.reportTableHeader}>
            <span>Offre</span>
            <span>Entreprise</span>
            <span style={{ textAlign: 'right' }}>Score</span>
            <span></span>
          </div>
          {sorted.map((r, i) => (
            <div key={i} className={styles.reportTableRow}>
              <span className={styles.reportJobTitle} title={r.job_title}>{r.job_title}</span>
              <span className={styles.reportCompany}>{r.job_company}</span>
              <span className={styles.reportScore} style={{ color: scoreColor(r.score) }}>
                {r.score !== null ? `${r.score}%` : (r.error ? '⚠' : '—')}
              </span>
              <span>
                {r.job_url && (
                  <a href={r.job_url} target="_blank" rel="noreferrer" className={styles.reportLink}>
                    <ExternalLink size={10} strokeWidth={2} />
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className={styles.reportHint}>
        Les offres sont disponibles dans la page <strong>Offres</strong>.
      </p>
    </div>
  )
}

// ── Indicateur de progression ─────────────────────────────────────────────────
function RunProgress({ status, onCancel }) {
  const isActive = status.status === 'scraping' || status.status === 'scoring'

  const phaseLabel = status.phase === 'scraping'
    ? '🔍 Recherche d\'offres (Indeed + LinkedIn)…'
    : status.phase === 'scoring'
    ? `🤖 Scoring avec ${status.cv_name || 'le CV sélectionné'}…`
    : status.message

  return (
    <div className={styles.progressCard}>
      <div className={styles.progressHeader}>
        {isActive
          ? <Loader size={15} strokeWidth={2} className={styles.spin} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
          : status.status === 'done'
          ? <CheckCircle size={15} strokeWidth={2} style={{ color: '#3cddc7', flexShrink: 0 }} />
          : status.status === 'error'
          ? <XCircle size={15} strokeWidth={2} style={{ color: 'var(--error)', flexShrink: 0 }} />
          : status.status === 'cancelled'
          ? <StopCircle size={15} strokeWidth={2} style={{ color: '#f9c74f', flexShrink: 0 }} />
          : <Zap size={15} strokeWidth={2} style={{ color: 'var(--outline)', flexShrink: 0 }} />
        }
        <div className={styles.progressInfo}>
          <span className={styles.progressLabel}>{phaseLabel || status.message}</span>
          {status.status === 'scoring' && status.score_total > 0 && (
            <span className={styles.progressSub}>
              {status.score_done}/{status.score_total} offres scorées
            </span>
          )}
        </div>
        {isActive && !status.cancel_requested && (
          <button className={styles.cancelBtn} onClick={onCancel}>
            <StopCircle size={12} strokeWidth={2} /> Annuler
          </button>
        )}
      </div>

      {isActive && (
        <div className={styles.progressTrack}>
          <div className={styles.progressBar}
            style={status.status === 'scoring' && status.score_total > 0 ? {
              width: `${Math.round((status.score_done / status.score_total) * 100)}%`,
              transition: 'width 0.5s ease',
            } : {}} />
        </div>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function AutomationPage() {
  const { data: cvList } = useAsync(fetchCVList, [], { fallback: [] })

  // Formulaire
  const [keywords,    setKeywords]    = useState('')
  const [country,     setCountry]     = useState('Switzerland')
  const [city,        setCity]        = useState('')
  const [selCvId,     setSelCvId]     = useState('')
  const [runHour,     setRunHour]     = useState(8)
  const [runMinute,   setRunMinute]   = useState(0)
  const [startDate,   setStartDate]   = useState('')
  const [endDate,     setEndDate]     = useState('')
  const [proxyText,   setProxyText]   = useState('')
  const [proxyOpen,   setProxyOpen]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveErr,     setSaveErr]     = useState(null)

  // État global
  const [config,      setConfig]      = useState(null)   // config active en DB
  const [runStatus,   setRunStatus]   = useState(null)   // état du run courant
  const [showModal,   setShowModal]   = useState(false)
  const [loading,     setLoading]     = useState(true)
  const pollRef = useRef(null)

  const validProxyCount = countValidProxies(proxyText)
  const location        = buildLocation(country, city)
  const citySuggestions = CITY_SUGGESTIONS[country] ?? []

  // CV sélectionné
  const selectedCv = (cvList ?? []).find(c => String(c.id) === String(selCvId))

  // Charger config + status au montage
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const [cfg, st] = await Promise.all([fetchAutomationConfig(), fetchAutomationStatus()])
        applyConfig(cfg)
        setRunStatus(st)
      } catch(e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Polling quand un run est actif
  useEffect(() => {
    const isActive = runStatus?.status === 'scraping' || runStatus?.status === 'scoring'
    if (isActive && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        try {
          const st = await fetchAutomationStatus()
          setRunStatus(st)
          if (st.status !== 'scraping' && st.status !== 'scoring') {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        } catch(e) { /* silencieux */ }
      }, 2500)
    }
    if (!isActive && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {}
  }, [runStatus?.status])

  // Nettoyer le polling au démontage
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  function applyConfig(cfg) {
    setConfig(cfg)
    if (!cfg || !cfg.enabled) return
    if (cfg.keywords)  setKeywords(cfg.keywords)
    if (cfg.cv_id)     setSelCvId(String(cfg.cv_id))
    if (cfg.run_hour !== undefined) setRunHour(cfg.run_hour)
    if (cfg.run_minute !== undefined) setRunMinute(cfg.run_minute)
    if (cfg.start_date) setStartDate(cfg.start_date)
    if (cfg.end_date)   setEndDate(cfg.end_date)
    if (cfg.proxies?.length) setProxyText(cfg.proxies.join('\n'))
    if (cfg.location) {
      // Essayer de découper "Ville, Pays"
      const parts = cfg.location.split(',').map(s => s.trim())
      if (parts.length === 2) { setCity(parts[0]); setCountry(parts[1]) }
      else { setCountry(cfg.location) }
    }
  }

  const handleSaveAndActivate = () => {
    if (!keywords.trim() || !selCvId) return
    setShowModal(true)
  }

  const handleConfirm = async () => {
    setShowModal(false)
    setSaving(true)
    setSaveErr(null)
    try {
      const payload = {
        enabled:    true,
        keywords:   keywords.trim(),
        location:   location || null,
        cv_id:      parseInt(selCvId),
        cv_name:    selectedCv?.name || null,
        proxies:    parseProxyLines(proxyText),
        run_hour:   runHour,
        run_minute: runMinute,
        start_date: startDate || null,
        end_date:   endDate   || null,
      }
      const res = await saveAutomationConfig(payload)
      setConfig(res.config)
    } catch(err) {
      setSaveErr(err.detail ?? err.message ?? 'Erreur de sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    if (!window.confirm('Désactiver l\'automatisation ?')) return
    try {
      await deleteAutomationConfig()
      setConfig({ enabled: false })
    } catch(err) {
      alert('Erreur : ' + (err.detail ?? err.message))
    }
  }

  const handleRunNow = async () => {
    try {
      await runAutomationNow()
      const st = await fetchAutomationStatus()
      setRunStatus(st)
    } catch(err) {
      alert('Erreur : ' + (err.detail ?? err.message))
    }
  }

  const handleCancel = async () => {
    try {
      await cancelAutomation()
      const st = await fetchAutomationStatus()
      setRunStatus(st)
    } catch(err) {
      console.error(err)
    }
  }

  const isActive  = config?.enabled
  const isRunning = runStatus?.status === 'scraping' || runStatus?.status === 'scoring'
  const canSave   = keywords.trim().length > 0 && selCvId && !saving && !isRunning

  if (loading) {
    return (
      <div className={styles.page} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap: 12, color: 'var(--outline)', fontSize: 13 }}>
        <Loader size={18} className={styles.spin} strokeWidth={1.5} style={{ color: 'var(--primary)' }} />
        Chargement…
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {showModal && (
        <LaunchConfirmModal
          config={{
            keywords: keywords.trim(),
            location,
            run_hour: runHour,
            run_minute: runMinute,
            start_date: startDate,
            end_date:   endDate,
            cv_name:    selectedCv?.name,
          }}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}

      {/* En-tête */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>
            Automatisation
          </h1>
          <p className={styles.pageSub}>
            Recherche quotidienne automatique sur Indeed + LinkedIn · Scoring IA avec votre CV actif.
          </p>
        </div>
        <div className={styles.headerStatus}>
          {isActive
            ? <span className={styles.statusActive}><CheckCircle size={13} strokeWidth={2} /> Activée</span>
            : <span className={styles.statusInactive}><XCircle size={13} strokeWidth={2} /> Inactive</span>
          }
        </div>
      </div>

      {/* Progression run courant */}
      {runStatus && runStatus.status !== 'idle' && (
        <RunProgress status={runStatus} onCancel={handleCancel} />
      )}

      {/* Rapport du dernier run terminé */}
      {runStatus?.status === 'done' && (
        <RunReport status={runStatus} />
      )}

      {/* Formulaire de configuration */}
      <div className={styles.formCard}>
        <p className={styles.formTitle}>
          <Zap size={14} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />
          Configuration de l'automatisation
        </p>

        {/* Info fixe */}
        <div className={styles.fixedParamsBox}>
          <Info size={12} strokeWidth={2} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className={styles.fixedParamsText}>
              <strong>Paramètres fixes</strong> (non modifiables pour maximiser l'automatisation) :{' '}
              Sources = <strong>Indeed + LinkedIn</strong> ·
              Offres publiées depuis = <strong>24h</strong> ·
              Résultats par source = <strong>10</strong>
            </p>
          </div>
        </div>

        {/* Mots-clés */}
        <div className={styles.fieldRow}>
          <label className={styles.label}>
            Mots-clés de recherche *
            <span className={styles.labelHint}>Opérateurs logiques supportés</span>
          </label>
          <input
            className={styles.input}
            type="text"
            placeholder="Ex : supply chain manager, DevOps engineer, data analyst…"
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            disabled={isRunning}
          />
          <div className={styles.operatorsHelp}>
            {/* Opérateurs */}
            <div className={styles.operatorsGrid}>
              <div className={styles.operatorRow}>
                <code>AND</code>
                <span>Les deux termes obligatoires · <em>Python AND senior</em></span>
              </div>
              <div className={styles.operatorRow}>
                <code>OR</code>
                <span>L'un ou l'autre · <em>DevOps OR SRE</em></span>
              </div>
              <div className={styles.operatorRow}>
                <code>NOT</code>
                <span>Exclure un terme · <em>Python NOT junior</em></span>
              </div>
              <div className={styles.operatorRow}>
                <code>" "</code>
                <span>Phrase exacte · <em>"machine learning"</em></span>
              </div>
              <div className={styles.operatorRow}>
                <code>( )</code>
                <span>Groupement · <em>(Python OR Java) AND NOT stage</em></span>
              </div>
            </div>
            {/* Tableau de compatibilité */}
            <div className={styles.compatTable}>
              <div className={styles.compatHeader}>
                <span>Source</span>
                <span>AND / OR</span>
                <span>NOT</span>
                <span>" "</span>
                <span>( )</span>
              </div>
              <div className={styles.compatRow}>
                <span className={styles.compatSource}>Indeed</span>
                <span className={styles.compatNative}>✓ natif</span>
                <span className={styles.compatNative}>✓ natif</span>
                <span className={styles.compatNative}>✓ natif</span>
                <span className={styles.compatNative}>✓ natif</span>
              </div>
              <div className={styles.compatRow}>
                <span className={styles.compatSource}>LinkedIn</span>
                <span className={styles.compatNative}>✓ natif</span>
                <span className={styles.compatNative}>✓ natif</span>
                <span className={styles.compatNative}>✓ natif</span>
                <span className={styles.compatNative}>✓ natif</span>
              </div>
            </div>
            <p className={styles.compatNote}>
              Postulator applique également un filtre booléen sur les résultats reçus — garantissant que les offres correspondent à votre requête même si la plateforme l'ignore partiellement.
            </p>
          </div>
        </div>

        {/* Localisation */}
        <div className={styles.fieldRow}>
          <label className={styles.label}>Localisation</label>
          <div className={styles.locationRow}>
            <select
              className={styles.select}
              value={country}
              onChange={e => { setCountry(e.target.value); setCity('') }}
              disabled={isRunning}
            >
              <option value="">🌍 Monde entier</option>
              <optgroup label="⭐ Favoris">
                {COUNTRIES.filter(c => c.favorite).map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Autres pays">
                {COUNTRIES.filter(c => !c.favorite).map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
            </select>
            <input
              className={styles.cityInput}
              type="text"
              placeholder={citySuggestions[0] ? `Ex : ${citySuggestions[0]}` : 'Ville (optionnel)'}
              value={city}
              onChange={e => setCity(e.target.value)}
              list="auto-city-suggestions"
              disabled={isRunning}
            />
            <datalist id="auto-city-suggestions">
              {citySuggestions.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          {location && (
            <p className={styles.locationPreview}>→ Envoyé au scraper : <strong>{location}</strong></p>
          )}
        </div>

        {/* CV actif */}
        <div className={styles.fieldRow}>
          <label className={styles.label}>CV actif pour le scoring *</label>
          <select
            className={styles.select}
            value={selCvId}
            onChange={e => setSelCvId(e.target.value)}
            disabled={isRunning}
          >
            <option value="">— Choisir un CV —</option>
            {(cvList ?? []).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {!cvList?.length && (
            <p className={styles.noDataHint}>Aucun CV — créez-en un dans la page <strong>CV</strong>.</p>
          )}
        </div>

        {/* Horaire */}
        <div className={styles.fieldRow}>
          <label className={styles.label}>
            <Clock size={12} strokeWidth={2} style={{ color: 'var(--primary)' }} />
            Heure de lancement quotidien
          </label>
          <div className={styles.timeRow}>
            <select className={styles.timeSelect} value={runHour} onChange={e => setRunHour(Number(e.target.value))} disabled={isRunning}>
              {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}h</option>)}
            </select>
            <span className={styles.timeSep}>:</span>
            <select className={styles.timeSelect} value={runMinute} onChange={e => setRunMinute(Number(e.target.value))} disabled={isRunning}>
              {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
            </select>
            <span className={styles.timeZone}>Europe/Paris</span>
          </div>
        </div>

        {/* Période */}
        <div className={styles.fieldRow}>
          <label className={styles.label}>
            <Calendar size={12} strokeWidth={2} style={{ color: 'var(--primary)' }} />
            Période d'activité
          </label>
          <div className={styles.dateRow}>
            <div>
              <span className={styles.dateLabel}>Du</span>
              <input type="date" className={styles.dateInput} value={startDate}
                onChange={e => setStartDate(e.target.value)} disabled={isRunning} />
            </div>
            <span className={styles.dateSep}>→</span>
            <div>
              <span className={styles.dateLabel}>Au</span>
              <input type="date" className={styles.dateInput} value={endDate}
                onChange={e => setEndDate(e.target.value)} disabled={isRunning} />
            </div>
          </div>
          <p className={styles.dateHint}>
            Laissez vide pour démarrer dès maintenant / sans date de fin.
            Postulator s'arrêtera automatiquement à la date de fin.
          </p>
        </div>

        {/* Proxies */}
        <div className={styles.proxySeparator} />
        <div className={styles.proxySection}>
          <button
            className={`${styles.proxyToggleBtn} ${proxyOpen ? styles.proxyToggleBtnOpen : ''}`}
            onClick={() => setProxyOpen(o => !o)}
          >
            <div className={styles.proxyToggleLeft}>
              <Shield size={14} strokeWidth={2} className={styles.proxyShieldIcon} />
              <div>
                <span className={styles.proxyToggleLabel}>Proxies résidentiels</span>
                <span className={styles.proxyToggleSub}>
                  Recommandé pour l'automatisation longue durée · Votre IP reste cachée
                </span>
              </div>
            </div>
            <div className={styles.proxyToggleRight}>
              {validProxyCount > 0 && (
                <span className={styles.proxyCountBadge}>
                  <Wifi size={10} strokeWidth={2} /> {validProxyCount} proxy{validProxyCount > 1 ? 's' : ''}
                </span>
              )}
              {proxyOpen
                ? <ChevronUp  size={14} strokeWidth={2} style={{ color: 'var(--outline)' }} />
                : <ChevronDown size={14} strokeWidth={2} style={{ color: 'var(--outline)' }} />
              }
            </div>
          </button>
          {proxyOpen && (
            <div className={styles.proxyPanel}>
              <p className={styles.proxyPanelSub}>
                Format : <code>IP:PORT:USERNAME:PASSWORD</code> — un proxy par ligne.
                Ces proxies seront sauvegardés et réutilisés à chaque lancement automatique.
              </p>
              <div className={styles.proxyStats}>
                {validProxyCount > 0
                  ? <span className={styles.proxyValid}><Wifi size={11} strokeWidth={2} />{validProxyCount} valide{validProxyCount > 1 ? 's' : ''}</span>
                  : <span className={styles.proxyInvalid}><WifiOff size={11} strokeWidth={2} /> Aucun proxy — IP directe</span>
                }
              </div>
              <textarea
                className={styles.proxyTextarea}
                value={proxyText}
                onChange={e => setProxyText(e.target.value)}
                placeholder={`31.59.20.176:6754:username:password\n...`}
                rows={6}
                spellCheck={false}
                disabled={isRunning}
              />
            </div>
          )}
        </div>

        {saveErr && (
          <div className={styles.errorBox}>
            <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} /> {saveErr}
          </div>
        )}

        {/* Actions */}
        <div className={styles.formActions}>
          <div style={{ display: 'flex', gap: 8 }}>
            {isActive && (
              <button
                className={styles.runNowBtn}
                onClick={handleRunNow}
                disabled={isRunning}
                title="Lancer immédiatement sans attendre l'heure planifiée"
              >
                {isRunning
                  ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> En cours…</>
                  : <><Play size={13} strokeWidth={2} /> Lancer maintenant</>
                }
              </button>
            )}
            {isActive && (
              <button className={styles.deactivateBtn} onClick={handleDeactivate} disabled={isRunning}>
                <Trash2 size={13} strokeWidth={2} /> Désactiver
              </button>
            )}
          </div>
          <button
            className={styles.saveBtn}
            onClick={handleSaveAndActivate}
            disabled={!canSave}
          >
            {saving
              ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Activation…</>
              : isActive
              ? <><Save size={13} strokeWidth={2} /> Mettre à jour</>
              : <><Zap size={13} strokeWidth={2} /> Activer l'automatisation</>
            }
          </button>
        </div>
      </div>

      {/* Infos techniques */}
      <div className={styles.infoSection}>
        <div className={styles.infoCard}>
          <h3 className={styles.infoTitle}>Comment ça fonctionne</h3>
          <div className={styles.infoSteps}>
            <div className={styles.infoStep}>
              <span className={styles.infoStepNum}>1</span>
              <div>
                <strong>Démarrage de Postulator</strong>
                <p>À chaque redémarrage de l'API, Postulator lit <code>automation_config.json</code> et replanifie automatiquement le job.</p>
              </div>
            </div>
            <div className={styles.infoStep}>
              <span className={styles.infoStepNum}>2</span>
              <div>
                <strong>Lancement quotidien</strong>
                <p>À l'heure configurée, le scraping se lance sur <strong>Indeed + LinkedIn</strong> (10 offres/source, publiées dans les 24h).</p>
              </div>
            </div>
            <div className={styles.infoStep}>
              <span className={styles.infoStepNum}>3</span>
              <div>
                <strong>Scoring automatique</strong>
                <p>Une fois le scraping terminé, Ollama score chaque nouvelle offre contre votre CV actif (max 20 offres par run).</p>
              </div>
            </div>
            <div className={styles.infoStep}>
              <span className={styles.infoStepNum}>4</span>
              <div>
                <strong>Résultats disponibles</strong>
                <p>Les offres apparaissent dans la page <strong>Offres</strong>. Ce rapport s'affiche ici après chaque run.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
