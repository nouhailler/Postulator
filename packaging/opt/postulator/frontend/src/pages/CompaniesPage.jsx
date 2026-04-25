import { useEffect, useRef, useState } from 'react'
import {
  Building2, Plus, Search, Loader, CheckCircle, XCircle,
  AlertTriangle, ExternalLink, Trash2, Play, RefreshCw,
  ChevronDown, ChevronUp, Shield, Wifi, WifiOff, X,
  Zap, Brain, Globe, Edit3, Check, Clock, Layers,
  Sparkles, MousePointerClick,
} from 'lucide-react'
import {
  fetchCompanies, createCompany, updateCompany, deleteCompany,
  discoverCompanyUrl, scrapeCompany, scrapeAllCompanies,
  fetchRunStatus, fetchCompaniesConfig, saveCompaniesConfig,
  cancelCompanyRun, ddgSearch,
} from '../api/companies.js'
import styles from './CompaniesPage.module.css'

// ── Constantes ────────────────────────────────────────────────────────────────

const ATS_META = {
  greenhouse:         { label: 'Greenhouse',      color: '#22c55e' },
  lever:              { label: 'Lever',           color: '#3b82f6' },
  ashby:              { label: 'Ashby',           color: '#a855f7' },
  smartrecruiters:    { label: 'SmartRecruiters', color: '#3cddc7' },
  workday:            { label: 'Workday',         color: '#6366f1' },
  taleo:              { label: 'Taleo',           color: '#f59e0b' },
  icims:              { label: 'iCIMS',           color: '#ec4899' },
  bamboohr:           { label: 'BambooHR',        color: '#84cc16' },
  teamtailor:         { label: 'Teamtailor',      color: '#06b6d4' },
  recruitee:          { label: 'Recruitee',       color: '#f97316' },
  welcometothejungle: { label: 'WTTJ',            color: '#facc15' },
  custom:             { label: 'Site custom',     color: '#88929b' },
  unknown:            { label: 'Inconnu',         color: '#88929b' },
}

const STATUS_META = {
  pending:     { label: 'En attente',   color: 'var(--outline)',   Icon: Clock },
  discovering: { label: 'Découverte…',  color: 'var(--primary)',   Icon: Search,       spin: true },
  discovered:  { label: 'URL trouvée',  color: 'var(--primary)',   Icon: CheckCircle },
  scraping:    { label: 'Scraping…',   color: '#f59e0b',           Icon: Loader,       spin: true },
  done:        { label: 'Terminé',     color: '#3cddc7',           Icon: CheckCircle },
  error:       { label: 'Erreur',      color: 'var(--error)',      Icon: XCircle },
}

function countValidProxies(text) {
  return text.split('\n').filter(l => {
    const p = l.trim().split(':')
    return p.length >= 2 && p.every(x => x.trim())
  }).length
}

function parseProxyLines(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l && l.split(':').length >= 2)
}

// ── Badges ────────────────────────────────────────────────────────────────────

function AtsBadge({ type }) {
  const meta = ATS_META[type] || ATS_META.unknown
  return (
    <span
      className={styles.atsBadge}
      style={{ borderColor: meta.color + '55', color: meta.color, background: meta.color + '18' }}
    >
      {meta.label}
    </span>
  )
}

function StatusBadge({ status, runState }) {
  const isRunning = runState?.running
  const eff = isRunning
    ? (runState.phase === 'discovering' ? 'discovering' : 'scraping')
    : (status || 'pending')
  const meta = STATUS_META[eff] || STATUS_META.pending
  const { Icon } = meta
  return (
    <span className={styles.statusBadge} style={{ color: meta.color, background: meta.color + '18' }}>
      <Icon size={10} strokeWidth={2} className={meta.spin ? styles.spin : ''} />
      {meta.label}
    </span>
  )
}

// ── Modal Ajout ───────────────────────────────────────────────────────────────

// ── Mots-clés DDG prédéfinis ──────────────────────────────────────────────────
const DDG_KEYWORDS = ['careers', 'jobs', 'emplois', 'recrutement', 'offres emploi', 'hiring', 'vacancies', 'join us']

function AddCompanyModal({ onCompanyAdded, onAddAndDiscover, onScrapeStarted, onClose }) {
  // ── Étape 1 : formulaire ──────────────────────────────────────────────────
  const [step,   setStep]   = useState('form') // 'form' | 'ddg'
  const [name,   setName]   = useState('')
  const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState(null)

  // ── Étape 2 : DDG ─────────────────────────────────────────────────────────
  const [company,      setCompany]      = useState(null)
  const [ddgKeyword,   setDdgKeyword]   = useState('careers')
  const [ddgCustom,    setDdgCustom]    = useState('')
  const [ddgQuery,     setDdgQuery]     = useState('')   // query réellement utilisée
  const [ddgResults,   setDdgResults]   = useState([])
  const [ddgSearching, setDdgSearching] = useState(false)
  const [ddgErr,       setDdgErr]       = useState(null)
  const [ddgDebug,     setDdgDebug]     = useState(null)
  const [validatedUrl, setValidatedUrl] = useState(null)
  const [launching,    setLaunching]    = useState(false)

  const activeKw = ddgCustom.trim() || ddgKeyword

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // ── Créer l'entreprise puis passer en mode DDG ────────────────────────────
  const handleAddDDG = async () => {
    if (!name.trim()) return
    setSaving(true); setErr(null)
    try {
      const created = await createCompany({ name: name.trim(), domain: domain.trim() || null })
      onCompanyAdded(created)
      setCompany(created)
      setStep('ddg')
    } catch (ex) {
      setErr(ex.message || 'Erreur lors de l\'ajout.')
    } finally {
      setSaving(false)
    }
  }

  // ── Créer puis déclencher la découverte auto ──────────────────────────────
  const handleAddAndDiscover = async () => {
    if (!name.trim()) return
    setSaving(true); setErr(null)
    try {
      await onAddAndDiscover({ name: name.trim(), domain: domain.trim() || null })
    } catch (ex) {
      setErr(ex.message || 'Erreur lors de l\'ajout.')
      setSaving(false)
    }
  }

  // ── Lancer la recherche DDG ───────────────────────────────────────────────
  const handleDDGSearch = async () => {
    setDdgSearching(true); setDdgErr(null); setDdgResults([]); setValidatedUrl(null); setDdgDebug(null)
    try {
      const res = await ddgSearch(company.name, activeKw)
      setDdgQuery(res.query)
      setDdgDebug(res.debug || null)
      setDdgResults(res.results || [])
      if (!res.results?.length) setDdgErr('Aucun résultat.')
    } catch (ex) {
      setDdgErr(ex.message || 'Erreur DDG.')
    } finally {
      setDdgSearching(false)
    }
  }

  // ── Valider l'URL et lancer le scraping ───────────────────────────────────
  const handleLaunch = async () => {
    if (!validatedUrl || !company) return
    setLaunching(true)
    try {
      await updateCompany(company.id, {
        careers_url:   validatedUrl,
        scrape_status: 'discovered',
        error_msg:     null,
      })
      onScrapeStarted(company.id)
      onClose()
    } catch (ex) {
      setDdgErr(ex.message || 'Erreur lors du lancement.')
      setLaunching(false)
    }
  }

  // ── Render étape 1 : formulaire ───────────────────────────────────────────
  if (step === 'form') return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <Building2 size={18} strokeWidth={2} style={{ color: 'var(--primary)' }} />
          <h2 className={styles.modalTitle}>Ajouter une entreprise</h2>
          <button className={styles.modalClose} onClick={onClose}><X size={16} strokeWidth={2} /></button>
        </div>
        <div className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Nom de l'entreprise *</label>
            <input
              autoFocus
              className={styles.formInput}
              type="text"
              placeholder="Ex : Nestlé, LVMH, Airbus…"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddAndDiscover()}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Domaine web{' '}
              <span className={styles.formLabelOpt}>(optionnel — améliore la découverte auto)</span>
            </label>
            <input
              className={styles.formInput}
              type="text"
              placeholder="Ex : nestle.com, airbus.com"
              value={domain}
              onChange={e => setDomain(e.target.value)}
            />
            <p className={styles.formHint}>Sans https:// ni www.</p>
          </div>
          {err && <p className={styles.formErr}><AlertTriangle size={11} strokeWidth={2} /> {err}</p>}

          {/* ── Deux options ── */}
          <div className={styles.addOptions}>
            <button
              type="button"
              className={styles.addOptionDDG}
              disabled={!name.trim() || saving}
              onClick={handleAddDDG}
            >
              <Search size={13} strokeWidth={2} />
              <div>
                <span className={styles.addOptionTitle}>Ajouter et rechercher avec DuckDuckGo</span>
                <span className={styles.addOptionSub}>Choisissez vos mots-clés, parcourez les résultats</span>
              </div>
            </button>
            <button
              type="button"
              className={styles.addOptionAuto}
              disabled={!name.trim() || saving}
              onClick={handleAddAndDiscover}
            >
              {saving
                ? <Loader size={13} strokeWidth={2} className={styles.spin} />
                : <Sparkles size={13} strokeWidth={2} />}
              <div>
                <span className={styles.addOptionTitle}>Ajouter et Découvrir l'URL</span>
                <span className={styles.addOptionSub}>LLM + sonde automatique + DDG en fallback</span>
              </div>
            </button>
          </div>

          <div className={styles.modalFooter} style={{ borderTop: 'none', paddingTop: 0 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Render étape 2 : recherche DDG ────────────────────────────────────────
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBoxWide} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.modalHeader}>
          <Search size={16} strokeWidth={2} style={{ color: 'var(--primary)' }} />
          <h2 className={styles.modalTitle}>
            Recherche DuckDuckGo
            <span className={styles.modalTitleSub}> — {company?.name}</span>
          </h2>
          <button className={styles.modalClose} onClick={onClose}><X size={16} strokeWidth={2} /></button>
        </div>

        <div className={styles.ddgBody}>
          {/* ── Constructeur de requête ── */}
          <div className={styles.ddgQuerySection}>
            <p className={styles.ddgLabel}>Mot-clé de recherche</p>
            <div className={styles.ddgChipsRow}>
              {DDG_KEYWORDS.map(kw => (
                <button
                  key={kw}
                  className={`${styles.ddgChip} ${ddgKeyword === kw && !ddgCustom.trim() ? styles.ddgChipActive : ''}`}
                  onClick={() => { setDdgKeyword(kw); setDdgCustom('') }}
                >
                  {kw}
                </button>
              ))}
            </div>
            <div className={styles.ddgCustomRow}>
              <span className={styles.ddgOr}>ou saisir :</span>
              <input
                className={styles.ddgCustomInput}
                type="text"
                placeholder="mot-clé libre…"
                value={ddgCustom}
                onChange={e => setDdgCustom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDDGSearch()}
              />
            </div>
            <div className={styles.ddgSearchRow}>
              <span className={styles.ddgQueryPreview}>
                Requête : <strong>« {company?.name} {activeKw} »</strong>
              </span>
              <button
                className={styles.ddgSearchBtn}
                onClick={handleDDGSearch}
                disabled={ddgSearching}
              >
                {ddgSearching
                  ? <><Loader size={12} strokeWidth={2} className={styles.spin} /> Recherche…</>
                  : <><Search size={12} strokeWidth={2} /> Rechercher</>}
              </button>
            </div>
          </div>

          {/* ── Debug DDG ── */}
          {ddgDebug && (
            <div className={styles.ddgDebugBox}>
              <p className={styles.ddgDebugTitle}>🔬 Diagnostic DDG</p>
              <div className={styles.ddgDebugGrid}>
                <span className={styles.ddgDebugKey}>Requête envoyée</span>
                <span className={styles.ddgDebugVal}><strong>«&nbsp;{ddgDebug.query_sent}&nbsp;»</strong></span>

                {ddgDebug.normalized && <>
                  <span className={styles.ddgDebugKey}>Normalisation accents</span>
                  <span className={styles.ddgDebugVal}>
                    «&nbsp;{ddgDebug.company_name_raw}&nbsp;» → «&nbsp;{ddgDebug.company_name_normalized}&nbsp;»
                  </span>
                </>}

                <span className={styles.ddgDebugKey}>Module DDG</span>
                <span className={`${styles.ddgDebugVal} ${ddgDebug.ddg_module?.includes('MANQUANT') ? styles.ddgDebugErr : styles.ddgDebugOk}`}>
                  {ddgDebug.ddg_module}
                </span>

                <span className={styles.ddgDebugKey}>Durée</span>
                <span className={styles.ddgDebugVal}>{ddgDebug.duration_ms} ms</span>

                <span className={styles.ddgDebugKey}>Résultats</span>
                <span className={`${styles.ddgDebugVal} ${ddgDebug.results_count === 0 ? styles.ddgDebugErr : styles.ddgDebugOk}`}>
                  {ddgDebug.results_count}
                </span>

                {ddgDebug.error && <>
                  <span className={styles.ddgDebugKey}>Erreur</span>
                  <span className={`${styles.ddgDebugVal} ${styles.ddgDebugErr}`}>{ddgDebug.error}</span>
                </>}
              </div>
              {ddgDebug.results_count === 0 && !ddgDebug.error && (
                <p className={styles.ddgDebugHint}>
                  DDG a répondu mais sans résultats. Causes possibles : rate-limit temporaire,
                  mot-clé trop spécifique, ou DDG bloque les requêtes automatisées depuis ce serveur.
                  Essayez un autre mot-clé ou patientez 30 secondes.
                </p>
              )}
            </div>
          )}

          {/* ── Résultats ── */}
          {ddgErr && !ddgSearching && (
            <div className={styles.ddgErrMsg}>
              <AlertTriangle size={12} strokeWidth={2} /> {ddgErr}
            </div>
          )}

          {ddgResults.length > 0 && (
            <>
              <p className={styles.ddgResultsHeader}>
                {ddgResults.length} résultat{ddgResults.length > 1 ? 's' : ''} pour{' '}
                <em>« {ddgQuery} »</em> — cliquez ✅ pour valider l'URL à scraper
              </p>
              <div className={styles.ddgResultsList}>
                {ddgResults.map((r, i) => (
                  <div
                    key={i}
                    className={`${styles.ddgResult} ${validatedUrl === r.url ? styles.ddgResultValidated : ''}`}
                  >
                    <div className={styles.ddgResultLeft}>
                      <p className={styles.ddgResultTitle}>{r.title || '(sans titre)'}</p>
                      <p className={styles.ddgResultUrl}>{r.url.replace(/^https?:\/\//, '').slice(0, 72)}</p>
                      {r.snippet && (
                        <p className={styles.ddgResultSnippet}>{r.snippet.slice(0, 120)}…</p>
                      )}
                    </div>
                    <div className={styles.ddgResultActions}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.ddgPreviewBtn}
                        title="Ouvrir dans un nouvel onglet"
                      >
                        <ExternalLink size={12} strokeWidth={2} /> Voir
                      </a>
                      <button
                        className={`${styles.ddgValidateBtn} ${validatedUrl === r.url ? styles.ddgValidateBtnActive : ''}`}
                        onClick={() => setValidatedUrl(validatedUrl === r.url ? null : r.url)}
                        title={validatedUrl === r.url ? 'Dévalider' : 'Valider cette URL'}
                      >
                        <Check size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Barre URL validée + bouton Scraper ── */}
          <div className={`${styles.ddgValidatedBar} ${validatedUrl ? styles.ddgValidatedBarActive : ''}`}>
            {validatedUrl ? (
              <>
                <CheckCircle size={13} strokeWidth={2} style={{ color: '#3cddc7', flexShrink: 0 }} />
                <span className={styles.ddgValidatedUrl} title={validatedUrl}>
                  {validatedUrl.replace(/^https?:\/\//, '').slice(0, 60)}
                  {validatedUrl.length > 64 ? '…' : ''}
                </span>
                <button
                  className={styles.ddgLaunchBtn}
                  onClick={handleLaunch}
                  disabled={launching}
                >
                  {launching
                    ? <><Loader size={12} strokeWidth={2} className={styles.spin} /> Lancement…</>
                    : <><Play size={12} strokeWidth={2} /> Lancer le scraping</>}
                </button>
              </>
            ) : (
              <span className={styles.ddgValidatedPlaceholder}>
                <MousePointerClick size={12} strokeWidth={2} />
                Cliquez ✅ sur le résultat qui correspond à la page emploi
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Carte Entreprise ──────────────────────────────────────────────────────────

function LogPanel({ logs }) {
  const bottomRef = useRef(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs?.length])

  if (!logs?.length) return null
  return (
    <div className={styles.logPanel}>
      {logs.map((entry, i) => (
        <div key={i} className={`${styles.logEntry} ${styles['logEntry_' + (entry.level || 'info')]}`}>
          <span className={styles.logDot}>
            {entry.level === 'ok'    ? '✅' :
             entry.level === 'error' ? '❌' :
             entry.level === 'warn'  ? '⚠️' :
             entry.level === 'debug' ? '  ' : '→'}
          </span>
          <span className={styles.logMsg}>{entry.msg}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function CompanyCard({ company, runState, onDiscover, onScrape, onCancel, onDelete, onUpdateUrl }) {
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlDraft,   setUrlDraft]   = useState(company.careers_url || '')
  const [showLogs,   setShowLogs]   = useState(false)

  const isRunning   = runState?.running
  const canDiscover = !isRunning
  const canScrape   = !!company.careers_url && !isRunning
  const atsMeta     = ATS_META[company.ats_type] || ATS_META.unknown

  // Auto-ouvre les logs dès qu'un run démarre (découverte OU scraping)
  useEffect(() => {
    if (isRunning) setShowLogs(true)
  }, [isRunning])

  const saveUrl = async () => {
    setEditingUrl(false)
    if (urlDraft !== (company.careers_url || '')) {
      await onUpdateUrl(company.id, urlDraft.trim())
    }
  }

  return (
    <div className={`${styles.card} ${company.scrape_status === 'error' ? styles.cardErr : ''}`}>

      {/* En-tête */}
      <div className={styles.cardTop}>
        <div className={styles.cardTopLeft}>
          <div
            className={styles.cardIcon}
            style={{ background: atsMeta.color + '18', borderColor: atsMeta.color + '44' }}
          >
            <Building2 size={15} strokeWidth={2} style={{ color: atsMeta.color }} />
          </div>
          <div className={styles.cardNames}>
            <h3 className={styles.cardName}>{company.name}</h3>
            {company.domain && <p className={styles.cardDomain}>{company.domain}</p>}
          </div>
        </div>
        <div className={styles.cardBadges}>
          <StatusBadge status={company.scrape_status} runState={runState} />
          {company.ats_type && company.ats_type !== 'unknown' && (
            <AtsBadge type={company.ats_type} />
          )}
        </div>
      </div>

      {/* URL */}
      <div className={styles.cardUrl}>
        {editingUrl ? (
          <>
            <input
              autoFocus
              className={styles.urlInput}
              value={urlDraft}
              onChange={e => setUrlDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveUrl()
                if (e.key === 'Escape') setEditingUrl(false)
              }}
              placeholder="https://…"
            />
            <button className={styles.iconBtn} onClick={saveUrl} title="Valider">
              <Check size={13} strokeWidth={2.5} style={{ color: '#3cddc7' }} />
            </button>
            <button className={styles.iconBtn} onClick={() => setEditingUrl(false)} title="Annuler">
              <X size={13} strokeWidth={2} />
            </button>
          </>
        ) : (
          <>
            <Globe size={11} strokeWidth={2} style={{ color: 'var(--outline)', flexShrink: 0 }} />
            {company.careers_url ? (
              <span className={styles.urlText} title={company.careers_url}>
                {company.careers_url.replace(/^https?:\/\//, '').slice(0, 52)}
                {company.careers_url.length > 56 ? '…' : ''}
              </span>
            ) : (
              <span className={styles.urlNone}>URL non découverte</span>
            )}
            <div className={styles.urlBtns}>
              <button
                className={styles.iconBtn}
                title="Modifier l'URL manuellement"
                onClick={() => { setUrlDraft(company.careers_url || ''); setEditingUrl(true) }}
              >
                <Edit3 size={11} strokeWidth={2} />
              </button>
              {company.careers_url && (
                <a
                  href={company.careers_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.iconBtn}
                  title="Ouvrir dans le navigateur"
                >
                  <ExternalLink size={11} strokeWidth={2} />
                </a>
              )}
            </div>
          </>
        )}
      </div>

      {/* Erreur */}
      {company.error_msg && !isRunning && (
        <div className={styles.cardErrMsg}>
          <AlertTriangle size={10} strokeWidth={2} />
          {company.error_msg.slice(0, 130)}
        </div>
      )}

      {/* Run en cours */}
      {isRunning && runState?.message && (
        <div className={styles.cardRunMsg}>
          <Loader size={10} strokeWidth={2} className={styles.spin} />
          {runState.message}
        </div>
      )}

      {/* Toggle logs */}
      {runState?.logs?.length > 0 && (
        <button
          className={styles.logsToggleBtn}
          onClick={() => setShowLogs(v => !v)}
        >
          {showLogs ? <ChevronUp size={10} strokeWidth={2} /> : <ChevronDown size={10} strokeWidth={2} />}
          {showLogs ? 'Masquer' : 'Voir'} les logs ({runState.logs.length})
          {isRunning && <Loader size={9} strokeWidth={2} className={styles.spin} style={{ marginLeft: 4 }} />}
        </button>
      )}
      {showLogs && runState?.logs?.length > 0 && (
        <LogPanel logs={runState.logs} />
      )}

      {/* Stats */}
      <div className={styles.cardStats}>
        {company.last_scraped_at ? (
          <span>
            {new Date(company.last_scraped_at).toLocaleDateString('fr-FR', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        ) : (
          <span>Jamais scrapé</span>
        )}
        {company.jobs_found > 0 && (
          <span className={styles.jobsFound}>
            <Layers size={10} strokeWidth={2} />
            {company.jobs_found} offre{company.jobs_found !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className={styles.cardActions}>
        {isRunning ? (
          <button
            className={styles.cancelBtn}
            onClick={() => onCancel(company.id)}
            title="Annuler l'opération en cours"
          >
            <X size={12} strokeWidth={2} /> Annuler
          </button>
        ) : (
          <>
            <button
              className={styles.discoverBtn}
              onClick={() => onDiscover(company.id)}
              disabled={!canDiscover}
              title="Découvrir l'URL carrières via DuckDuckGo + IA"
            >
              <Search size={12} strokeWidth={2} /> Découvrir URL
            </button>
            <button
              className={styles.scrapeBtn}
              onClick={() => onScrape(company.id)}
              disabled={!canScrape}
              title={canScrape ? 'Scraper les offres' : 'Découvrez d\'abord l\'URL'}
            >
              <Play size={12} strokeWidth={2} /> Scraper
            </button>
          </>
        )}
        <button
          className={styles.deleteBtn}
          onClick={() => onDelete(company.id)}
          disabled={isRunning}
          title="Supprimer"
        >
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const [companies,    setCompanies]    = useState([])
  const [runStatus,    setRunStatus]    = useState({})
  const [loading,      setLoading]      = useState(true)
  const [pageErr,      setPageErr]      = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // Config
  const [configOpen,   setConfigOpen]   = useState(false)
  const [aiProvider,   setAiProvider]   = useState('ollama')
  const [orModel,      setOrModel]      = useState('')
  const [orModels,     setOrModels]     = useState([])
  const [orConfigured, setOrConfigured] = useState(false)
  const [orLoading,    setOrLoading]    = useState(false)
  const [proxyOpen,    setProxyOpen]    = useState(false)
  const [proxyText,    setProxyText]    = useState('')
  const [savingCfg,    setSavingCfg]    = useState(false)
  const [cfgSaved,     setCfgSaved]     = useState(false)

  const pollRef         = useRef(null)
  const validProxyCount = countValidProxies(proxyText)

  // ── Initialisation ──────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const [list, cfg, st, orStatus] = await Promise.all([
          fetchCompanies(),
          fetchCompaniesConfig(),
          fetchRunStatus(),
          fetch('/api/settings/openrouter').then(r => r.json()).catch(e => {
            console.error('OR status check failed:', e)
            return { configured: false }
          }),
        ])
        setCompanies(list)
        setRunStatus(st)
        if (cfg.proxies?.length)  setProxyText(cfg.proxies.join('\n'))
        if (cfg.or_model)         setOrModel(cfg.or_model)
        // Définir orConfigured AVANT de restaurer aiProvider pour éviter le flash "non configuré"
        const configured = !!(orStatus?.configured)
        setOrConfigured(configured)
        if (configured) loadOrModels()
        if (cfg.ai_provider)      setAiProvider(cfg.ai_provider)
      } catch (e) {
        setPageErr('Impossible de charger les données.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // ── Polling ─────────────────────────────────────────────────────────────────
  // Intervalle plus rapide (800ms) pendant une découverte pour avoir les logs en temps réel
  useEffect(() => {
    const anyRunning    = Object.values(runStatus).some(s => s?.running)
    const anyLogs       = Object.values(runStatus).some(s => s?.running && (s?.phase === 'discovering' || s?.phase === 'scraping'))
    const interval      = anyLogs ? 800 : 2500

    if (anyRunning) {
      // Relancer l'intervalle si l'intervalle actuel n'est pas au bon rythme
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      pollRef.current = setInterval(async () => {
        try {
          const st = await fetchRunStatus()
          setRunStatus(st)
          if (!Object.values(st).some(s => s?.running)) {
            // Refresh la liste une dernière fois quand tout est terminé
            const list = await fetchCompanies()
            setCompanies(list)
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        } catch {}
      }, interval)
    }
    if (!anyRunning && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [runStatus])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // ── OpenRouter ──────────────────────────────────────────────────────────────
  const loadOrStatus = async () => {
    try {
      const data = await fetch('/api/settings/openrouter').then(r => r.json())
      const configured = !!(data?.configured)
      setOrConfigured(configured)
      if (configured) loadOrModels()
    } catch (e) {
      console.error('OR status check failed:', e)
      setOrConfigured(false)
    }
  }

  const loadOrModels = async () => {
    setOrLoading(true)
    try {
      const data = await fetch('/api/settings/openrouter/models').then(r => r.json())
      setOrModels(Array.isArray(data) ? data : [])
    } catch { setOrModels([]) }
    finally { setOrLoading(false) }
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleCompanyAdded = company => {
    setCompanies(prev => [company, ...prev])
  }

  const handleDelete = async id => {
    if (!window.confirm('Supprimer cette entreprise ?')) return
    await deleteCompany(id)
    setCompanies(prev => prev.filter(c => c.id !== id))
    setRunStatus(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const triggerPoll = () => {
    // Force le démarrage du polling (l'useEffect le détectera)
    setRunStatus(prev => ({ ...prev }))
  }

  const handleDiscover = async id => {
    try {
      await discoverCompanyUrl(id)
      setRunStatus(prev => ({
        ...prev,
        [id]: { running: true, phase: 'discovering', message: 'Recherche en cours…' },
      }))
      triggerPoll()
    } catch (e) {
      alert('Erreur : ' + (e.detail ?? e.message))
    }
  }

  const handleScrape = async id => {
    try {
      await scrapeCompany(id)
      setRunStatus(prev => ({
        ...prev,
        [id]: { running: true, phase: 'scraping', message: 'Scraping en cours…' },
      }))
      triggerPoll()
    } catch (e) {
      alert('Erreur : ' + (e.detail ?? e.message))
    }
  }

  // Appelé par le modal DDG : URL déjà sauvée, on lance le scraping
  const handleScrapeStartedFromModal = id => {
    setRunStatus(prev => ({
      ...prev,
      [id]: { running: true, phase: 'scraping', message: 'Scraping en cours…' },
    }))
    fetchCompanies().then(list => setCompanies(list)).catch(() => {})
    triggerPoll()
    scrapeCompany(id).catch(e => console.error('scrape error', e))
  }

  // Créer + déclencher la découverte auto (bouton "Ajouter et Découvrir")
  const handleAddAndDiscover = async payload => {
    const company = await createCompany(payload)
    setCompanies(prev => [company, ...prev])
    setShowAddModal(false)
    handleDiscover(company.id)
  }

  const handleCancel = async id => {
    try {
      await cancelCompanyRun(id)
      setRunStatus(prev => ({
        ...prev,
        [id]: { ...prev[id], message: 'Annulation en cours…' },
      }))
    } catch (e) {
      console.error('cancel error', e)
    }
  }

  const handleScrapeAll = async () => {
    try {
      await scrapeAllCompanies()
      const st = await fetchRunStatus()
      setRunStatus(st)
      triggerPoll()
    } catch (e) {
      alert('Erreur : ' + (e.detail ?? e.message))
    }
  }

  const handleUpdateUrl = async (id, url) => {
    const updated = await updateCompany(id, {
      careers_url:   url || null,
      scrape_status: url ? 'discovered' : 'pending',
      error_msg:     null,
    })
    setCompanies(prev => prev.map(c => c.id === id ? updated : c))
  }

  const handleSaveConfig = async () => {
    setSavingCfg(true)
    try {
      await saveCompaniesConfig({
        proxies:     parseProxyLines(proxyText),
        ai_provider: aiProvider,
        or_model:    aiProvider === 'openrouter' ? orModel : null,
      })
      setCfgSaved(true)
      setTimeout(() => setCfgSaved(false), 3000)
    } catch {}
    finally { setSavingCfg(false) }
  }

  // ── Métriques ───────────────────────────────────────────────────────────────
  const anyRunning  = Object.values(runStatus).some(s => s?.running)
  const withUrl     = companies.filter(c => c.careers_url).length
  const totalJobs   = companies.reduce((s, c) => s + (c.jobs_found || 0), 0)
  const doneCount   = companies.filter(c => c.scrape_status === 'done').length

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--outline)', fontSize: 13 }}>
        <Loader size={18} strokeWidth={1.5} className={styles.spin} style={{ color: 'var(--primary)' }} />
        Chargement…
      </div>
    )
  }

  return (
    <div className={styles.page}>

      {showAddModal && (
        <AddCompanyModal
          onCompanyAdded={handleCompanyAdded}
          onAddAndDiscover={handleAddAndDiscover}
          onScrapeStarted={handleScrapeStartedFromModal}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ── En-tête ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Entreprises</h1>
          <p className={styles.pageSub}>
            Scraping ciblé des pages carrières · Détection ATS automatique (Greenhouse, Lever, Ashby…) · Extraction IA adaptative
          </p>
        </div>
        <div className={styles.headerActions}>
          {withUrl >= 1 && (
            <button className={styles.scrapeAllBtn} onClick={handleScrapeAll} disabled={anyRunning}>
              {anyRunning
                ? <><Loader size={13} strokeWidth={2} className={styles.spin} /> En cours…</>
                : <><Play size={13} strokeWidth={2} /> Scraper tout ({withUrl})</>}
            </button>
          )}
          <button className={styles.addBtn2} onClick={() => setShowAddModal(true)}>
            <Plus size={13} strokeWidth={2.5} /> Ajouter une entreprise
          </button>
        </div>
      </div>

      {pageErr && (
        <div className={styles.errBanner}>
          <AlertTriangle size={13} strokeWidth={2} /> {pageErr}
        </div>
      )}

      {/* ── Config ── */}
      <div className={styles.configCard}>
        <button className={styles.configToggle} onClick={() => setConfigOpen(o => !o)}>
          <div className={styles.configLeft}>
            <Brain size={14} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
            <span className={styles.configLabel}>Moteur IA &amp; Proxies</span>
            <span className={styles.configSub}>
              {aiProvider === 'openrouter' ? `OpenRouter · ${orModel || '—'}` : 'Ollama (local)'}
              {validProxyCount > 0 ? ` · ${validProxyCount} proxy${validProxyCount > 1 ? 's' : ''}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {cfgSaved && (
              <span className={styles.savedPill}><Check size={10} strokeWidth={2.5} /> Sauvegardé</span>
            )}
            {configOpen
              ? <ChevronUp size={14} strokeWidth={2} style={{ color: 'var(--outline)' }} />
              : <ChevronDown size={14} strokeWidth={2} style={{ color: 'var(--outline)' }} />}
          </div>
        </button>

        {configOpen && (
          <div className={styles.configPanel}>

            {/* AI Provider */}
            <div className={styles.cfgSection}>
              <p className={styles.cfgSectionTitle}>Moteur d'extraction IA</p>
              <div className={styles.aiToggle}>
                <button
                  className={`${styles.aiBtn} ${aiProvider === 'ollama' ? styles.aiBtnOllama : ''}`}
                  onClick={() => setAiProvider('ollama')}
                >🤖 Ollama (local)</button>
                <button
                  className={`${styles.aiBtn} ${aiProvider === 'openrouter' ? styles.aiBtnOR : ''}`}
                  onClick={() => { setAiProvider('openrouter'); loadOrStatus() }}
                ><Zap size={11} strokeWidth={2} /> OpenRouter</button>
              </div>

              {aiProvider === 'openrouter' && (
                orConfigured ? (
                  <div className={styles.orRow}>
                    {orModels.length > 0 ? (
                      <select
                        className={styles.orSelect}
                        value={orModel}
                        onChange={e => setOrModel(e.target.value)}
                      >
                        {orModels.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
                        {orModel && !orModels.find(m => m.id === orModel) && (
                          <option value={orModel}>{orModel}</option>
                        )}
                      </select>
                    ) : (
                      <input
                        className={styles.orInput}
                        type="text"
                        placeholder="deepseek/deepseek-r1:free"
                        value={orModel}
                        onChange={e => setOrModel(e.target.value)}
                      />
                    )}
                    <button
                      className={styles.orRefreshBtn}
                      onClick={loadOrModels}
                      disabled={orLoading}
                      title="Rafraîchir les modèles"
                    >
                      <RefreshCw size={11} strokeWidth={2} className={orLoading ? styles.spin : ''} />
                    </button>
                  </div>
                ) : (
                  <p className={styles.orWarn}>
                    <AlertTriangle size={11} strokeWidth={2} />
                    OpenRouter non configuré —{' '}
                    <a href="/settings" className={styles.orWarnLink}>ajoutez votre clé API dans Paramètres</a>
                  </p>
                )
              )}
              {aiProvider === 'ollama' && (
                <p className={styles.aiNote}>
                  Ollama doit être démarré. Utilisé pour la découverte d'URL et l'extraction sur les sites custom.
                </p>
              )}
            </div>

            {/* Proxies */}
            <div className={styles.cfgSection}>
              <button className={styles.proxyToggleBtn} onClick={() => setProxyOpen(o => !o)}>
                <Shield size={13} strokeWidth={2} style={{ color: validProxyCount > 0 ? 'var(--tertiary)' : 'var(--outline)' }} />
                <p className={styles.cfgSectionTitle} style={{ margin: 0 }}>Proxies résidentiels</p>
                {validProxyCount > 0
                  ? <span className={styles.proxyBadge}><Wifi size={10} strokeWidth={2} /> {validProxyCount}</span>
                  : <span className={styles.proxyNone}><WifiOff size={10} strokeWidth={2} /> IP directe</span>}
                <span style={{ marginLeft: 'auto' }}>
                  {proxyOpen
                    ? <ChevronUp size={13} strokeWidth={2} style={{ color: 'var(--outline)' }} />
                    : <ChevronDown size={13} strokeWidth={2} style={{ color: 'var(--outline)' }} />}
                </span>
              </button>
              {proxyOpen && (
                <div className={styles.proxyPanel}>
                  <p className={styles.proxyHint}>
                    Format : <code>IP:PORT:USERNAME:PASSWORD</code> — un proxy par ligne.<br />
                    Fortement recommandé pour éviter les blocages Cloudflare / Akamai.
                  </p>
                  <textarea
                    className={styles.proxyTextarea}
                    value={proxyText}
                    onChange={e => setProxyText(e.target.value)}
                    rows={5}
                    placeholder={'31.59.20.176:6754:username:password\n...'}
                    spellCheck={false}
                  />
                </div>
              )}
            </div>

            <div className={styles.cfgActions}>
              <button className={styles.saveCfgBtn} onClick={handleSaveConfig} disabled={savingCfg}>
                {savingCfg
                  ? <><Loader size={12} className={styles.spin} strokeWidth={2} /> Sauvegarde…</>
                  : <><Check size={12} strokeWidth={2} /> Sauvegarder la configuration</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Liste ── */}
      {companies.length === 0 ? (
        <div className={styles.empty}>
          <Building2 size={40} strokeWidth={1} style={{ color: 'var(--outline)', opacity: 0.35 }} />
          <p style={{ fontWeight: 700 }}>Aucune entreprise configurée</p>
          <p style={{ fontSize: 12, color: 'var(--outline)', textAlign: 'center', lineHeight: 1.6 }}>
            Ajoutez des entreprises cibles pour scraper leurs offres d'emploi<br />
            directement depuis leur site carrières ou leur ATS.
          </p>
          <button className={styles.addBtn2} onClick={() => setShowAddModal(true)}>
            <Plus size={13} strokeWidth={2.5} /> Ajouter ma première entreprise
          </button>
        </div>
      ) : (
        <>
          {/* Stats */}
          {doneCount > 0 && (
            <div className={styles.globalStats}>
              <CheckCircle size={12} strokeWidth={2} style={{ color: '#3cddc7' }} />
              <span>{doneCount} entreprise{doneCount > 1 ? 's' : ''} scrapée{doneCount > 1 ? 's' : ''}</span>
              <span className={styles.statDot}>·</span>
              <span>{totalJobs} offre{totalJobs !== 1 ? 's' : ''} collectée{totalJobs !== 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Grille */}
          <div className={styles.grid}>
            {companies.map(company => (
              <CompanyCard
                key={company.id}
                company={company}
                runState={runStatus[company.id]}
                onDiscover={handleDiscover}
                onScrape={handleScrape}
                onCancel={handleCancel}
                onDelete={handleDelete}
                onUpdateUrl={handleUpdateUrl}
              />
            ))}
          </div>

          {/* Note ATS */}
          <div className={styles.atsNote}>
            <Layers size={11} strokeWidth={2} style={{ color: 'var(--outline)', flexShrink: 0, marginTop: 1 }} />
            <span>
              Les ATS connus (Greenhouse, Lever, Ashby, SmartRecruiters) utilisent leurs <strong>API publiques</strong> — pas de navigateur ni de LLM requis, extraction fiable et rapide.
              Les sites custom utilisent <strong>httpx + IA</strong> (ou Playwright si installé) pour l'extraction adaptative.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
