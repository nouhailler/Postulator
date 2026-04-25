import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Search, Loader, Clock, Send, ChevronDown, Sparkles,
  AlertCircle, Hourglass, Zap, Cpu, CheckCircle2, X, Maximize2, Trash2,
} from 'lucide-react'
import { useAsync } from '../hooks/useAsync.js'
import { fetchJobs } from '../api/jobs.js'
import { api } from '../api/client.js'
import styles from './JobAnalysisPage.module.css'

// ── Rendu Markdown avec surlignage des ==matches== ────────────────────────────
function renderSegments(text) {
  // Parse ==match== → <mark>, **bold**, ## headings, bullets
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let key = 0

  for (const line of lines) {
    const k = key++
    const trimmed = line.trim()

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={k} className={styles.mdH3}>{renderInline(trimmed.slice(3))}</h3>
      )
    } else if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={k} className={styles.mdH4}>{renderInline(trimmed.slice(4))}</h4>
      )
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <li key={k} className={styles.mdLi}>{renderInline(trimmed.slice(2))}</li>
      )
    } else if (trimmed === '') {
      elements.push(<div key={k} style={{ height: 6 }} />)
    } else {
      elements.push(
        <p key={k} className={styles.mdP}>{renderInline(trimmed)}</p>
      )
    }
  }
  return <div className={styles.mdRoot}>{elements}</div>
}

function renderInline(text) {
  // Split on ==match==, **bold**, *italic*
  const parts = text.split(/(==.+?==|\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('==') && part.endsWith('==')) {
      return <mark key={i} className={styles.match}>{part.slice(2, -2)}</mark>
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

// ── Nettoyage HTML ────────────────────────────────────────────────────────────
function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

// ── Modale plein écran ────────────────────────────────────────────────────────
function FullModal({ entry, isFirst, onClose }) {
  // Fermer sur Escape
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        {/* Header modale */}
        <div className={styles.modalHeader}>
          <div className={styles.cardHeaderLeft}>
            <Sparkles size={14} strokeWidth={2} className={styles.cardIcon} />
            <span className={styles.modalTitle}>
              {isFirst ? 'Analyse initiale' : 'Question de suivi'}
            </span>
            <span className={`${styles.providerBadge} ${entry.provider === 'openrouter' ? styles.providerOR : styles.providerOllama}`}>
              {entry.provider === 'openrouter'
                ? <><Zap size={10} strokeWidth={2} /> OpenRouter</>
                : <><Cpu size={10} strokeWidth={2} /> Ollama</>}
            </span>
            {entry.duration_ms > 0 && (
              <span className={styles.durationBadge}>
                <Clock size={10} strokeWidth={2} />
                {(entry.duration_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <button className={styles.modalClose} onClick={onClose} title="Fermer (Échap)">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Contexte */}
        {(entry.question || (isFirst && entry.criteria)) && (
          <div className={styles.modalContext}>
            <span className={styles.cardQuestionLabel}>
              {entry.question ? 'Question' : 'Contenu recherché'}
            </span>
            <p className={styles.cardQuestionText}>
              {entry.question || entry.criteria}
            </p>
          </div>
        )}

        {/* Contenu scrollable */}
        <div className={styles.modalBody}>
          {renderSegments(entry.answer)}
        </div>

        {/* Légende */}
        {entry.answer?.includes('==') && (
          <div className={styles.modalLegend}>
            <mark className={styles.match}>Texte surligné</mark>
            <span> = correspondance détectée avec le contenu recherché</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bulle de résultat (carte cliquable) ───────────────────────────────────────
function ResultCard({ entry, isFirst, onOpen }) {
  // Extrait un aperçu du texte brut (sans ==, **, ##)
  const preview = (entry.answer ?? '')
    .replace(/==[^=]+==/g, m => m.slice(2, -2))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,3} /gm, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 180)

  return (
    <div
      className={`${styles.card} ${isFirst ? styles.cardInitial : styles.cardFollowup}`}
      onClick={onOpen}
      title="Cliquer pour lire en plein écran"
    >
      {/* En-tête */}
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <Sparkles size={12} strokeWidth={2} className={styles.cardIcon} />
          <span className={styles.cardType}>
            {isFirst ? 'Analyse initiale' : 'Question de suivi'}
          </span>
        </div>
        <div className={styles.cardMeta}>
          <span className={`${styles.providerBadge} ${entry.provider === 'openrouter' ? styles.providerOR : styles.providerOllama}`}>
            {entry.provider === 'openrouter'
              ? <><Zap size={10} strokeWidth={2} /> OpenRouter</>
              : <><Cpu size={10} strokeWidth={2} /> Ollama</>}
          </span>
          {entry.duration_ms > 0 && (
            <span className={styles.durationBadge}>
              <Clock size={10} strokeWidth={2} />
              {(entry.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
          <span className={styles.expandHint}>
            <Maximize2 size={11} strokeWidth={2} /> Lire
          </span>
        </div>
      </div>

      {/* Contexte */}
      {(entry.question || (isFirst && entry.criteria)) && (
        <div className={styles.cardQuestion}>
          <span className={styles.cardQuestionLabel}>
            {entry.question ? 'Question' : 'Contenu recherché'}
          </span>
          <p className={styles.cardQuestionText}>
            {entry.question || entry.criteria}
          </p>
        </div>
      )}

      {/* Aperçu tronqué */}
      <div className={styles.cardPreview}>
        {preview}{preview.length >= 180 && <span className={styles.previewMore}>… cliquer pour lire</span>}
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function JobAnalysisPage() {
  // Provider IA
  const [aiProvider, setAiProvider] = useState('ollama')
  const [aiModel,    setAiModel]    = useState('')
  useEffect(() => {
    fetch('/api/settings/openrouter')
      .then(r => r.json())
      .then(d => { if (d.configured) { setAiProvider('openrouter'); setAiModel(d.model || '') } })
      .catch(() => {})
  }, [])
  const isOR = aiProvider === 'openrouter'

  // Sélection offre
  const [inputText,    setInputText]    = useState('')
  const [selectedJob,  setSelectedJob]  = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [browsingAll,  setBrowsingAll]  = useState(false)
  const dropdownRef = useRef(null)

  const { data: allJobs } = useAsync(
    () => fetchJobs({ sort_by: 'scraped_at', sort_order: 'desc', limit: 200 }),
    [], { fallback: [] }
  )

  const filteredJobs = (allJobs ?? []).filter(j => {
    if (browsingAll) return true
    const q = inputText.toLowerCase()
    return !q || (j.title ?? '').toLowerCase().includes(q) || (j.company ?? '').toLowerCase().includes(q)
  })

  useEffect(() => {
    const h = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false); setBrowsingAll(false)
        if (selectedJob) setInputText(`${selectedJob.title} — ${selectedJob.company}`)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [selectedJob])

  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadHistory = useCallback(async (jobId) => {
    setLoadingHistory(true)
    try {
      const data = await api.get(`/job-analysis/history/${jobId}`)
      // Convertir les entrées BDD au format local {criteria, question, answer, provider, model, duration_ms}
      setHistory((data ?? []).map(h => ({
        criteria:    h.criteria,
        question:    h.question,
        answer:      h.answer,
        provider:    h.provider,
        model:       h.model,
        duration_ms: h.duration_ms,
        desc_source: h.desc_source,
      })))
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const handleDeleteHistory = async () => {
    if (!selectedJob) return
    if (!window.confirm('Supprimer tout l\'historique des analyses pour cette offre ?')) return
    try {
      await api.delete(`/job-analysis/history/${selectedJob.id}`)
      setHistory([])
    } catch {}
  }

  const selectJob = job => {
    setSelectedJob(job)
    setInputText(`${job.title} — ${job.company}`)
    setShowDropdown(false); setBrowsingAll(false)
    setHistory([]); setFollowUp('')
    loadHistory(job.id)
  }

  // Formulaire
  const [criteria,  setCriteria]  = useState('')

  // Historique des échanges (chargé depuis BDD + nouvelles entrées en temps réel)
  const [history,   setHistory]   = useState([])  // [{criteria, question, answer, provider, duration_ms}]

  // Question de suivi
  const [followUp,  setFollowUp]  = useState('')

  // Modale
  const [modalEntry,   setModalEntry]   = useState(null)
  const [modalIsFirst, setModalIsFirst] = useState(false)
  const openModal  = (entry, isFirst) => { setModalEntry(entry); setModalIsFirst(isFirst) }
  const closeModal = () => setModalEntry(null)

  // État analyse en cours
  const [analyzing, setAnalyzing] = useState(false)
  const [elapsed,   setElapsed]   = useState(0)
  const timerRef  = useRef(null)
  const bottomRef = useRef(null)
  const followRef = useRef(null)
  const abortRef  = useRef(null)

  // Timer
  useEffect(() => {
    if (analyzing) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [analyzing])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, analyzing])

  // ── Appel API ──────────────────────────────────────────────────────────────
  const callAnalyze = useCallback(async ({ isInitial, question }) => {
    if (!selectedJob || analyzing) return
    if (isInitial && !criteria.trim()) return

    // Construire l'historique pour le backend
    const historyMessages = []
    for (const h of history) {
      if (h.criteria && historyMessages.length === 0) {
        // Le premier tour — le backend reconstruit le prompt complet
        historyMessages.push({ role: 'user', content: h.criteria })
      } else if (h.question) {
        historyMessages.push({ role: 'user', content: h.question })
      }
      historyMessages.push({ role: 'assistant', content: h.answer })
    }

    setAnalyzing(true)
    abortRef.current = new AbortController()

    try {
      const payload = {
        job_id:   selectedJob.id,
        criteria: criteria.trim(),
        history:  historyMessages,
        question: isInitial ? null : question?.trim() || null,
      }

      const res = await api.postAI('/job-analysis/analyze', payload, {
        signal: abortRef.current.signal,
      })

      setHistory(prev => [...prev, {
        criteria:    isInitial ? criteria.trim() : null,
        question:    isInitial ? null : question?.trim(),
        answer:      res.answer,
        provider:    res.provider,
        model:       res.model,
        duration_ms: res.duration_ms,
        desc_source: res.desc_source,
      }])

      if (!isInitial) setFollowUp('')
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setHistory(prev => [...prev, {
          criteria: null, question: question || 'Analyse',
          answer: `**Erreur :** ${err?.detail ?? err?.message ?? 'Connexion impossible'}`,
          provider: aiProvider, model: aiModel, duration_ms: 0,
        }])
      }
    } finally {
      setAnalyzing(false)
      abortRef.current = null
    }
  }, [selectedJob, criteria, history, analyzing, aiProvider, aiModel])

  const handleAnalyze = () => callAnalyze({ isInitial: true })

  const handleFollowUp = () => {
    if (!followUp.trim() || analyzing) return
    callAnalyze({ isInitial: false, question: followUp })
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFollowUp() }
  }

  const cleanDescription = selectedJob ? stripHtml(selectedJob.description) : ''
  const canAnalyze = selectedJob && criteria.trim() && !analyzing

  return (
    <div className={styles.page}>

      {/* ── En-tête ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>
            Analyse de l'offre
          </h1>
          <p className={styles.pageSub}>
            Évaluez si une offre correspond à votre contenu de poste — interprétation sémantique par IA.
          </p>
        </div>
        <div className={`${styles.providerBadgeLg} ${isOR ? styles.providerBadgeLgOR : styles.providerBadgeLgOllama}`}>
          {isOR
            ? <><Zap size={13} strokeWidth={2} /> OpenRouter · {aiModel || 'free'}</>
            : <><Cpu size={13} strokeWidth={2} /> Ollama · local</>}
        </div>
      </div>

      <div className={styles.layout}>

        {/* ── Panneau gauche ── */}
        <div className={styles.panel}>

          {/* Sélecteur d'offre */}
          <div className={styles.panelSection}>
            <label className={styles.label}>Offre à analyser</label>
            <div className={styles.comboWrap} ref={dropdownRef}>
              <div className={styles.comboField}>
                <Search size={13} className={styles.comboIcon} strokeWidth={2} />
                <input
                  className={styles.comboInput}
                  type="text"
                  placeholder="Rechercher une offre…"
                  value={inputText}
                  onChange={e => { setInputText(e.target.value); setShowDropdown(true); setBrowsingAll(false) }}
                  onFocus={() => {
                    if (selectedJob && inputText === `${selectedJob.title} — ${selectedJob.company}`) setInputText('')
                    setShowDropdown(true)
                  }}
                />
                <button
                  className={styles.comboChevronBtn}
                  onMouseDown={e => {
                    e.preventDefault(); e.stopPropagation()
                    setBrowsingAll(v => !v); setShowDropdown(v => !v)
                  }}
                  tabIndex={-1}
                >
                  <ChevronDown size={14} strokeWidth={2}
                    style={{ transition: 'transform 0.15s', transform: showDropdown ? 'rotate(180deg)' : 'none' }} />
                </button>
              </div>

              {showDropdown && filteredJobs.length > 0 && (
                <div className={styles.comboDropdown}>
                  {filteredJobs.slice(0, 60).map(job => (
                    <button
                      key={job.id}
                      className={`${styles.comboItem} ${selectedJob?.id === job.id ? styles.comboItemActive : ''}`}
                      onMouseDown={() => selectJob(job)}
                    >
                      <span className={styles.comboItemTitle}>{job.title}</span>
                      <span className={styles.comboItemMeta}>
                        {job.company} · <span style={{ textTransform: 'capitalize' }}>{job.source}</span>
                      </span>
                    </button>
                  ))}
                  {filteredJobs.length > 60 && (
                    <p className={styles.comboMore}>+{filteredJobs.length - 60} offres — affinez</p>
                  )}
                </div>
              )}
            </div>

            {/* Fiche mini de l'offre sélectionnée */}
            {selectedJob && (
              <div className={styles.jobMini}>
                <div className={styles.jobMiniInitials}>
                  {(selectedJob.company ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className={styles.jobMiniTitle}>{selectedJob.title}</p>
                  <p className={styles.jobMiniSub}>
                    {selectedJob.company}
                    {selectedJob.location && ` · ${selectedJob.location.split(',')[0]}`}
                    {!cleanDescription && <span className={styles.jobMiniWarn}> · Pas de description</span>}
                  </p>
                </div>
                {cleanDescription
                  ? <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
                  : <AlertCircle  size={14} strokeWidth={2} style={{ color: '#f9c74f', flexShrink: 0 }} />}
              </div>
            )}
          </div>

          {/* Contenu de poste */}
          <div className={styles.panelSection}>
            <label className={styles.label}>
              Contenu du poste recherché
              <span className={styles.labelHint}> — décrivez librement</span>
            </label>
            <textarea
              className={styles.criteriaInput}
              placeholder={
                'Ex : "un poste de direction avec management d\'équipe"\n' +
                'Ex : "développeur senior Python avec expérience cloud"\n' +
                'Ex : "poste commercial B2B en mode chasse, secteur SaaS"'
              }
              value={criteria}
              onChange={e => setCriteria(e.target.value)}
              rows={5}
              disabled={analyzing}
            />
          </div>

          {/* Bouton analyser */}
          <button
            className={`${styles.analyzeBtn} ${!canAnalyze ? styles.analyzeBtnDisabled : ''}`}
            onClick={handleAnalyze}
            disabled={!canAnalyze}
          >
            {analyzing && history.length === 0
              ? <>
                  <Hourglass size={15} strokeWidth={2} className={styles.spin} />
                  Analyse en cours… {elapsed}s
                </>
              : <>
                  <Sparkles size={15} strokeWidth={2} />
                  {history.length > 0 ? 'Relancer l\'analyse' : 'Analyser cette offre'}
                </>
            }
          </button>

          {!selectedJob && (
            <p className={styles.hint}>Sélectionnez d'abord une offre ci-dessus.</p>
          )}
          {selectedJob && !criteria.trim() && (
            <p className={styles.hint}>Décrivez le contenu de poste recherché.</p>
          )}
        </div>

        {/* ── Zone de résultats ── */}
        <div className={styles.resultsArea}>

          {loadingHistory ? (
            <div className={styles.empty}>
              <Loader size={24} strokeWidth={1.5} className={styles.spin} style={{ color: 'var(--primary)', marginBottom: 10 }} />
              <p style={{ fontSize: 13, color: 'var(--outline)' }}>Chargement de l'historique…</p>
            </div>
          ) : history.length === 0 && !analyzing ? (
            <div className={styles.empty}>
              <Sparkles size={36} strokeWidth={1} style={{ color: 'var(--outline)', marginBottom: 12 }} />
              <p>Sélectionnez une offre, décrivez votre contenu de poste,</p>
              <p>puis cliquez sur <strong>Analyser cette offre</strong>.</p>
              <p className={styles.emptyHint}>
                L'IA identifiera les correspondances sémantiques et les surlignera en
                <mark className={styles.match} style={{ marginLeft: 6 }}>rouge</mark>.
              </p>
            </div>
          ) : (
            <div className={styles.results}>

              {/* En-tête historique avec bouton suppression */}
              {history.length > 0 && !analyzing && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 }}>
                  <button
                    onClick={handleDeleteHistory}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, color: 'var(--outline)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
                    }}
                    title="Supprimer l'historique des analyses pour cette offre"
                  >
                    <Trash2 size={11} strokeWidth={2} /> Effacer l'historique
                  </button>
                </div>
              )}

              {/* Historique des échanges */}
              {history.map((entry, i) => {
                const isFirst = i === 0 && !entry.question
                return (
                  <ResultCard
                    key={i}
                    entry={entry}
                    isFirst={isFirst}
                    onOpen={() => openModal(entry, isFirst)}
                  />
                )
              })}

              {/* Animation pendant l'analyse */}
              {analyzing && (
                <div className={styles.thinking}>
                  <div className={styles.thinkingHeader}>
                    <div className={`${styles.providerBadge} ${isOR ? styles.providerOR : styles.providerOllama}`}>
                      {isOR
                        ? <><Zap size={10} strokeWidth={2} /> OpenRouter</>
                        : <><Cpu size={10} strokeWidth={2} /> Ollama</>}
                    </div>
                    <span className={styles.thinkingTimer}>
                      <Hourglass size={12} strokeWidth={2} className={styles.spin} />
                      {elapsed}s
                    </span>
                  </div>
                  <div className={styles.thinkingDots}>
                    <span /><span /><span />
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}

          {/* ── Zone question de suivi ── */}
          {history.length > 0 && (
            <div className={styles.followUpArea}>
              <div className={styles.followUpWrap}>
                <textarea
                  ref={followRef}
                  className={styles.followUpInput}
                  placeholder="Posez une question de suivi sur cette offre… (Entrée pour envoyer)"
                  value={followUp}
                  onChange={e => setFollowUp(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  disabled={analyzing}
                />
                <button
                  className={`${styles.sendBtn} ${(!followUp.trim() || analyzing) ? styles.sendBtnDisabled : ''}`}
                  onClick={handleFollowUp}
                  disabled={!followUp.trim() || analyzing}
                  title="Envoyer (Entrée)"
                >
                  {analyzing
                    ? <Loader size={16} className={styles.spin} strokeWidth={2} />
                    : <Send size={16} strokeWidth={2} />}
                </button>
              </div>
              <p className={styles.followUpHint}>
                {isOR
                  ? `Propulsé par OpenRouter · ${aiModel || 'free'} · Entrée pour envoyer`
                  : 'Propulsé par Ollama · IA 100% locale · Entrée pour envoyer'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modale plein écran ── */}
      {modalEntry && (
        <FullModal entry={modalEntry} isFirst={modalIsFirst} onClose={closeModal} />
      )}

    </div>
  )
}
