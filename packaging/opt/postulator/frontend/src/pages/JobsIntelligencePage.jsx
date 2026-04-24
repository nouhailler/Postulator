import { useEffect, useRef, useState, useCallback } from 'react'
import { MessageSquare, Search, Loader, Clock, X, Send, ChevronDown, Sparkles, AlertCircle, FileText, History, ChevronRight } from 'lucide-react'
import { useAsync } from '../hooks/useAsync.js'
import { fetchJobs } from '../api/jobs.js'
import { fetchJobQuestions } from '../api/jobsIntelligence.js'
import { api } from '../api/client.js'
import { useOllamaStatus } from '../contexts/OllamaStatusContext.jsx'
import styles from './JobsIntelligencePage.module.css'

// ── Suggestions de questions ──────────────────────────────────────────────────
const SUGGESTIONS = [
  // Compétences & profil
  "Quelles sont les compétences techniques indispensables pour ce poste ?",
  "Quelles sont les soft skills attendues ?",
  "Quel niveau d'expérience est requis ?",
  "Est-ce un poste adapté à un profil junior ou senior ?",
  // Poste & responsabilités
  "Quelles sont les principales responsabilités du poste ?",
  "Quels sont les défis ou challenges de ce rôle ?",
  "Ce poste offre-t-il des possibilités d'évolution ?",
  "Quel est le périmètre d'action et d'autonomie attendu ?",
  // Entreprise & contexte
  "Quel profil idéal recherche cette entreprise ?",
  "Que peut-on déduire de la culture d'entreprise ?",
  "Y a-t-il des avantages ou bénéfices mentionnés ?",
  "Dans quel secteur ou domaine l'entreprise évolue-t-elle ?",
  // Candidature & stratégie
  "Quels mots-clés sont importants à reprendre dans ma lettre de motivation ?",
  "Quels points forts mettre en avant pour maximiser mes chances ?",
  "Quelles questions me poseront-ils probablement en entretien ?",
  "Comment me préparer efficacement pour ce poste ?",
  "Quels sont les points de vigilance ou pièges à éviter ?",
  // Salaire & conditions
  "Y a-t-il des informations sur le salaire ou la rémunération ?",
  "Le poste est-il en présentiel, hybride ou full remote ?",
  "Y a-t-il des déplacements ou contraintes géographiques mentionnés ?",
]

// ── Bulle de message ──────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className={styles.msgUser}>
        <div className={styles.msgUserBubble}>{msg.content}</div>
      </div>
    )
  }
  if (msg.role === 'assistant') {
    return (
      <div className={styles.msgAssistant}>
        <div className={styles.msgAssistantIcon}>
          <Sparkles size={12} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />
        </div>
        <div className={styles.msgAssistantBubble}>
          {msg.desc_source === 'fetched' && (
            <span className={styles.msgFetchBadge} title="Description récupérée depuis la page de l'offre">
              🔗 Contenu récupéré depuis le site
            </span>
          )}
          {msg.desc_source === 'none' && (
            <span className={styles.msgNoBadge} title="Aucune description disponible">
              ⚠️ Pas de description — réponse basée sur le titre uniquement
            </span>
          )}
          <SimpleMarkdown text={msg.content} />
          {msg.duration_ms && (
            <span className={styles.msgDuration}>
              <Clock size={10} strokeWidth={2} /> {(msg.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>
    )
  }
  if (msg.role === 'error') {
    return (
      <div className={styles.msgError}>
        <AlertCircle size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
        {msg.content}
      </div>
    )
  }
  return null
}

// ── Panneau historique des questions ─────────────────────────────────────────
function PastQuestionsPanel({ questions, onReplay }) {
  const [expanded, setExpanded] = useState(false)

  if (!questions || questions.length === 0) return null

  return (
    <div className={styles.pastPanel}>
      <button
        className={styles.pastToggle}
        onClick={() => setExpanded(v => !v)}
        title={expanded ? 'Masquer l\'historique' : 'Voir les questions déjà posées'}
      >
        <History size={12} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
        <span className={styles.pastToggleLabel}>
          {questions.length} question{questions.length > 1 ? 's' : ''} déjà posée{questions.length > 1 ? 's' : ''}
        </span>
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={styles.pastChevron}
          style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
        />
      </button>

      {expanded && (
        <div className={styles.pastList}>
          {questions.map((q, i) => (
            <button
              key={q.id ?? i}
              className={styles.pastItem}
              onClick={() => onReplay(q.question)}
              title="Reposer cette question"
            >
              <span className={styles.pastItemQ}>{q.question}</span>
              <span className={styles.pastItemMeta}>
                <Clock size={9} strokeWidth={2} />
                {q.duration_ms ? `${(q.duration_ms / 1000).toFixed(1)}s` : ''}
                {q.asked_at && ` · ${new Date(q.asked_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Rendu Markdown minimal ────────────────────────────────────────────────────
function SimpleMarkdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let key = 0
  for (const line of lines) {
    const k = key++
    if (line.startsWith('### '))      elements.push(<h4 key={k} className={styles.mdH4}>{line.slice(4)}</h4>)
    else if (line.startsWith('## '))  elements.push(<h3 key={k} className={styles.mdH3}>{line.slice(3)}</h3>)
    else if (line.startsWith('# '))   elements.push(<h3 key={k} className={styles.mdH3}>{line.slice(2)}</h3>)
    else if (line.startsWith('- ') || line.startsWith('* '))
      elements.push(<li key={k} className={styles.mdLi}>{renderInline(line.slice(2))}</li>)
    else if (line.trim() === '')      elements.push(<div key={k} style={{ height: 6 }} />)
    else elements.push(<p key={k} className={styles.mdP}>{renderInline(line)}</p>)
  }
  return <div className={styles.mdRoot}>{elements}</div>
}

function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*')  && part.endsWith('*'))  return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

// ── Nettoyage HTML de la description ─────────────────────────────────────────
function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function JobsIntelligencePage() {
  const { setOllamaStatus, clearOllamaStatus } = useOllamaStatus()

  // Détection du provider IA actif
  const [aiProvider, setAiProvider] = useState('ollama')  // 'ollama' | 'openrouter'
  const [aiModel,    setAiModel]    = useState('')
  useEffect(() => {
    fetch('/api/settings/openrouter')
      .then(r => r.json())
      .then(d => {
        if (d.configured) {
          setAiProvider('openrouter')
          setAiModel(d.model || '')
        }
      })
      .catch(() => {})
  }, [])

  const isOpenRouter  = aiProvider === 'openrouter'
  const providerLabel = isOpenRouter ? 'OpenRouter' : 'Ollama'
  const badgeLabel    = isOpenRouter ? '100% Cloud · OpenRouter' : '100% local · Ollama'

  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedJob,   setSelectedJob]   = useState(null)
  const [jobSearch,     setJobSearch]     = useState('')
  const [showDropdown,  setShowDropdown]  = useState(false)
  const [inputText,     setInputText]     = useState('')

  const [question,      setQuestion]      = useState('')
  const [messages,      setMessages]      = useState([])
  const [thinking,      setThinking]      = useState(false)
  const [elapsed,       setElapsed]       = useState(0)

  // Historique des questions sauvegardées pour l'offre courante
  const [pastQuestions,    setPastQuestions]    = useState([])
  const [loadingPast,      setLoadingPast]      = useState(false)

  const abortRef    = useRef(null)
  const timerRef    = useRef(null)
  const chatEndRef  = useRef(null)
  const inputRef    = useRef(null)
  const dropdownRef = useRef(null)

  // Charger toutes les offres (200 max)
  const { data: allJobs } = useAsync(
    () => fetchJobs({ sort_by: 'scraped_at', sort_order: 'desc', limit: 200 }),
    [],
    { fallback: [] }
  )

  const [browsingAll, setBrowsingAll] = useState(false)

  const filteredJobs = (allJobs ?? []).filter(j => {
    if (browsingAll) return true
    if (!inputText) return true
    const q = inputText.toLowerCase()
    return (
      (j.title   ?? '').toLowerCase().includes(q) ||
      (j.company ?? '').toLowerCase().includes(q)
    )
  })

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    const h = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
        setBrowsingAll(false)
        if (selectedJob) setInputText(`${selectedJob.title} — ${selectedJob.company}`)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [selectedJob])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  useEffect(() => {
    if (thinking) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [thinking])

  // Charger les questions passées quand on sélectionne une offre
  const loadPastQuestions = useCallback(async (jobId) => {
    setLoadingPast(true)
    try {
      const data = await fetchJobQuestions(jobId)
      setPastQuestions(data ?? [])
    } catch {
      setPastQuestions([])
    } finally {
      setLoadingPast(false)
    }
  }, [])

  const selectJob = (job) => {
    setSelectedJobId(job.id)
    setSelectedJob(job)
    setInputText(`${job.title} — ${job.company}`)
    setJobSearch('')
    setBrowsingAll(false)
    setShowDropdown(false)
    setMessages([])
    setPastQuestions([])
    loadPastQuestions(job.id)
    inputRef.current?.focus()
  }

  const handleChevronClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (showDropdown) {
      setShowDropdown(false)
      setBrowsingAll(false)
    } else {
      setBrowsingAll(true)
      setShowDropdown(true)
    }
  }

  const handleInputChange = (e) => {
    setInputText(e.target.value)
    setJobSearch(e.target.value)
    setBrowsingAll(false)
    setShowDropdown(true)
  }

  const handleInputFocus = () => {
    if (selectedJob && inputText === `${selectedJob.title} — ${selectedJob.company}`) {
      setInputText('')
      setJobSearch('')
    }
    setShowDropdown(true)
  }

  const handleInputBlur = () => {}

  const handleAsk = async (q) => {
    const text = (q ?? question).trim()
    if (!text || !selectedJobId || thinking) return

    setMessages(prev => [...prev, { role: 'user', content: text }])
    setQuestion('')
    setThinking(true)
    setOllamaStatus('Offres Intelligence')

    abortRef.current = new AbortController()

    try {
      const res = await api.postAI('/jobs-intelligence/chat', {
        job_id:   selectedJobId,
        question: text,
      }, { signal: abortRef.current.signal })

      const newMsg = {
        role:        'assistant',
        content:     res.answer,
        duration_ms: res.duration_ms,
        desc_source: res.desc_source,
      }
      setMessages(prev => [...prev, newMsg])

      // Rafraîchir la liste des questions passées (ajouter la nouvelle)
      setPastQuestions(prev => [
        ...prev,
        {
          id:          Date.now(),
          question:    text,
          answer:      res.answer,
          model:       res.model,
          desc_source: res.desc_source,
          duration_ms: res.duration_ms,
          asked_at:    new Date().toISOString(),
        },
      ])
    } catch (err) {
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        setMessages(prev => [...prev, { role: 'error', content: 'Requête annulée.' }])
      } else {
        setMessages(prev => [...prev, {
          role:    'error',
          content: err?.detail ?? err?.message ?? 'Erreur de connexion à Ollama.',
        }])
      }
    } finally {
      setThinking(false)
      clearOllamaStatus()
      abortRef.current = null
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    clearInterval(timerRef.current)
    setThinking(false)
    clearOllamaStatus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  // Rejouer une question de l'historique
  const handleReplay = (questionText) => {
    setQuestion(questionText)
    inputRef.current?.focus()
  }

  const cleanDescription = selectedJob ? stripHtml(selectedJob.description) : ''
  const descPreview = cleanDescription.slice(0, 300)
  const noResults = filteredJobs.length === 0 && inputText && !browsingAll

  return (
    <div className={styles.page}>

      {/* En-tête */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>
            Offres Intelligence
          </h1>
          <p className={styles.pageSub}>
            Interrogez {providerLabel} sur n'importe quelle offre — interprétation, compétences, culture d'entreprise…
          </p>
        </div>
        <div className={styles.headerBadge} style={isOpenRouter ? { borderColor: 'rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.08)', color: '#f97316' } : {}}>
          <Sparkles size={13} strokeWidth={2} style={{ color: isOpenRouter ? '#f97316' : 'var(--tertiary)' }} />
          <span>{badgeLabel}</span>
        </div>
      </div>

      <div className={styles.layout}>

        {/* ── Colonne gauche ── */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <p className={styles.sidebarLabel}>Offre à analyser</p>

            {/* Combobox */}
            <div className={styles.comboWrap} ref={dropdownRef}>
              <div className={styles.comboField}>
                <Search size={13} className={styles.comboIcon} strokeWidth={2} />
                <input
                  className={styles.comboInput}
                  type="text"
                  placeholder="Rechercher une offre…"
                  value={inputText}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
                <button
                  className={styles.comboChevronBtn}
                  onMouseDown={handleChevronClick}
                  tabIndex={-1}
                  title="Parcourir toutes les offres"
                >
                  <ChevronDown
                    size={14}
                    strokeWidth={2}
                    style={{ transition: 'transform 0.15s', transform: showDropdown ? 'rotate(180deg)' : 'none' }}
                  />
                </button>
              </div>

              {showDropdown && filteredJobs.length > 0 && (
                <div className={styles.comboDropdown}>
                  {filteredJobs.slice(0, 60).map(job => (
                    <button
                      key={job.id}
                      className={`${styles.comboItem} ${selectedJobId === job.id ? styles.comboItemActive : ''}`}
                      onMouseDown={() => selectJob(job)}
                    >
                      <span className={styles.comboItemTitle}>{job.title}</span>
                      <span className={styles.comboItemMeta}>
                        {job.company} · <span style={{ textTransform: 'capitalize' }}>{job.source}</span>
                        {job.location && ` · ${job.location.split(',')[0]}`}
                      </span>
                    </button>
                  ))}
                  {filteredJobs.length > 60 && (
                    <p className={styles.comboMore}>
                      +{filteredJobs.length - 60} offres — affinez la recherche
                    </p>
                  )}
                </div>
              )}

              {showDropdown && noResults && (
                <div className={styles.comboDropdown}>
                  <p className={styles.comboEmpty}>
                    Aucune offre ne correspond à "{inputText}"
                  </p>
                </div>
              )}
            </div>

            {/* Fiche offre sélectionnée */}
            {selectedJob && (
              <div className={styles.jobCard}>
                <div className={styles.jobCardHeader}>
                  <div className={styles.jobCardInitials}>
                    {(selectedJob.company ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className={styles.jobCardTitle}>{selectedJob.title}</p>
                    <p className={styles.jobCardCompany}>{selectedJob.company}</p>
                  </div>
                </div>
                <div className={styles.jobCardMeta}>
                  {selectedJob.location && (
                    <span className={styles.jobCardMetaItem}>📍 {selectedJob.location}</span>
                  )}
                  <span className={styles.jobCardMetaItem} style={{ textTransform: 'capitalize' }}>
                    📡 {selectedJob.source}
                  </span>
                  {selectedJob.ai_score != null && (
                    <span className={styles.jobCardMetaItem} style={{ color: 'var(--tertiary)' }}>
                      ⭐ Score : {Math.round(selectedJob.ai_score)}%
                    </span>
                  )}
                </div>

                {cleanDescription ? (
                  <div className={styles.jobCardDescWrap}>
                    <div className={styles.jobCardDescHeader}>
                      <FileText size={11} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
                      <span className={styles.jobCardDescLabel}>Description transmise à {providerLabel}</span>
                    </div>
                    <p className={styles.jobCardDesc}>
                      {descPreview}{cleanDescription.length > 300 ? '…' : ''}
                    </p>
                    {cleanDescription.length > 300 && (
                      <p className={styles.jobCardDescMore}>
                        +{Math.round((cleanDescription.length - 300) / 5)} mots supplémentaires transmis
                      </p>
                    )}
                  </div>
                ) : (
                  <div className={styles.jobCardNoDesc}>
                    <AlertCircle size={11} strokeWidth={2} style={{ flexShrink: 0, color: '#f9c74f' }} />
                    <span>
                      Pas de description en base — <strong>le contenu de la page de l'offre sera récupéré automatiquement</strong> depuis
                      {' '}<code style={{ fontSize: 10 }}>{selectedJob.url?.slice(0, 40)}…</code> lors de votre première question.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Historique des questions posées pour cette offre */}
            {selectedJob && !loadingPast && (
              <PastQuestionsPanel
                questions={pastQuestions}
                onReplay={handleReplay}
              />
            )}
            {selectedJob && loadingPast && (
              <p className={styles.pastLoading}>
                <Loader size={11} strokeWidth={2} className={styles.spin} /> Chargement de l'historique…
              </p>
            )}

            {/* Suggestions */}
            {selectedJob && messages.length === 0 && (
              <div className={styles.suggestionsWrap}>
                <p className={styles.suggestionsLabel}>Questions suggérées</p>
                <div className={styles.suggestions}>
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} className={styles.suggestion} onClick={() => handleAsk(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Colonne droite : chat ── */}
        <div className={styles.chatArea}>

          {!selectedJob ? (
            <div className={styles.chatEmpty}>
              <MessageSquare size={40} strokeWidth={1} style={{ color: 'var(--outline)', marginBottom: 12 }} />
              <p>Sélectionnez une offre à gauche pour commencer</p>
              <p className={styles.chatEmptyHint}>
                Interrogez {providerLabel} sur n'importe quelle offre scrapée.
                Posez vos questions en langage naturel.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.messages}>
                {messages.length === 0 && (
                  <div className={styles.chatWelcome}>
                    <Sparkles size={20} strokeWidth={1.5} style={{ color: 'var(--tertiary)', marginBottom: 8 }} />
                    <p>Prêt à analyser <strong>{selectedJob.title}</strong></p>
                    <p className={styles.chatWelcomeHint}>
                      {cleanDescription
                        ? `La description complète de l'offre a été transmise à ${providerLabel}.`
                        : 'Attention : cette offre n\'a pas de description — les réponses seront limitées.'}
                    </p>
                    {pastQuestions.length > 0 && (
                      <p className={styles.chatWelcomeHistory}>
                        <History size={12} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />
                        {pastQuestions.length} question{pastQuestions.length > 1 ? 's' : ''} déjà posée{pastQuestions.length > 1 ? 's' : ''} sur cette offre
                      </p>
                    )}
                  </div>
                )}

                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

                {thinking && (
                  <div className={styles.thinking}>
                    <div className={styles.thinkingIcon}>
                      <Sparkles size={12} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />
                    </div>
                    <div className={styles.thinkingContent}>
                      <div className={styles.thinkingDots}>
                        <span /><span /><span />
                      </div>
                      <div className={styles.thinkingTimer}>
                        <Clock size={11} strokeWidth={2} />
                        <span>{elapsed}s</span>
                        <button className={styles.cancelBtn} onClick={handleCancel}>
                          <X size={11} strokeWidth={2} /> Annuler
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              <div className={styles.inputArea}>
                <div className={styles.inputWrap}>
                  <textarea
                    ref={inputRef}
                    className={styles.input}
                    placeholder="Posez votre question sur cette offre… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    disabled={thinking}
                  />
                  <button
                    className={`${styles.sendBtn} ${(!question.trim() || thinking) ? styles.sendBtnDisabled : ''}`}
                    onClick={() => handleAsk()}
                    disabled={!question.trim() || thinking}
                    title="Envoyer (Entrée)"
                  >
                    {thinking
                      ? <Loader size={16} className={styles.spin} strokeWidth={2} />
                      : <Send size={16} strokeWidth={2} />
                    }
                  </button>
                </div>
                <p className={styles.inputHint}>
                  Propulsé par {providerLabel}{isOpenRouter ? ` · ${aiModel}` : ' · IA 100% locale'} · Entrée pour envoyer
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
