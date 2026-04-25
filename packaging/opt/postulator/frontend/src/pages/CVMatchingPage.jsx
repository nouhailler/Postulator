import { useEffect, useRef, useState } from 'react'
import { useOllamaStatus } from '../contexts/OllamaStatusContext.jsx'
import {
  Sparkles, Trash2, Download, FileText, Loader,
  AlertCircle, Clock, ExternalLink, StickyNote, CheckCheck,
  GitCompare, Target, CheckCircle2, XCircle, Lightbulb,
  ChevronDown, ChevronUp, Save, X,
} from 'lucide-react'
import { useAsync }    from '../hooks/useAsync.js'
import { fetchCVList } from '../api/cvStore.js'
import { fetchJobs }   from '../api/jobs.js'
import {
  fetchGenerated, fetchGeneratedOne, generateMatchingCV, generateATSCV,
  generateATSCloudCV, fetchCloudStatus,
  saveATSCV, deleteGenerated, updateNotes, exportDocx,
} from '../api/cvMatching.js'
import styles from './CVMatchingPage.module.css'

// ── Chrono ────────────────────────────────────────────────────────────────────
function ElapsedTimer({ running }) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!running) { setS(0); return }
    const id = setInterval(() => setS(v => v + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  if (!running) return null
  const m = Math.floor(s / 60), sec = s % 60
  return <span className={styles.timer}><Clock size={10} strokeWidth={2} />{m > 0 ? `${m}m ` : ''}{sec}s</span>
}

// ── Algorithme de diff mot par mot ────────────────────────────────────────────
function tokenize(text) {
  return text.split(/(\s+|[.,;:!?()\[\]{}«»"'\-–—\/\\])/).filter(t => t.length > 0)
}

const STOPWORDS = new Set([
  'le','la','les','de','du','des','un','une','et','en','à','au','aux',
  'dans','sur','par','pour','avec','sans','sous','entre','vers',
  'que','qui','quoi','dont','où','mais','ou','donc','car','ni','si',
  'je','tu','il','elle','nous','vous','ils','elles','on',
  'ce','cet','cette','ces','mon','ton','son','ma','ta','sa',
  'mes','tes','ses','notre','votre','leur','leurs',
  'est','sont','a','ont','été','avoir','être',
  'the','of','and','in','to','a','an','for','with','on','at','by',
  'is','are','was','were','be','been','have','has','that','this',
])

function isNewWord(word, sourceText) {
  const w = word.toLowerCase().replace(/[.,;:!?()\[\]{}«»"']/g, '')
  if (w.length <= 2) return false
  if (STOPWORDS.has(w)) return false
  if (/^\d+$/.test(w)) return false
  return !sourceText.toLowerCase().includes(w)
}

function renderLineWithDiff(text, sourceText, enabled) {
  if (!enabled || !sourceText) return text
  const tokens = tokenize(text)
  return tokens.map((token, i) => {
    if (/^\s+$/.test(token) || /^[.,;:!?()\[\]{}«»"'\-–—\/\\]+$/.test(token)) return token
    if (isNewWord(token, sourceText)) return <span key={i} className={styles.diffNew}>{token}</span>
    return token
  })
}

// ── Rendu Markdown avec diff ──────────────────────────────────────────────────
function MarkdownCV({ text, sourceText, diffMode }) {
  if (!text) return null
  return (
    <div className={styles.cvMarkdown}>
      {text.split('\n').map((line, i) => {
        const render = (content) => renderLineWithDiff(content, sourceText, diffMode)
        if (line.startsWith('# '))   return <h1 key={i} className={styles.mdH1}>{render(line.slice(2))}</h1>
        if (line.startsWith('## '))  return <h2 key={i} className={styles.mdH2}>{render(line.slice(3))}</h2>
        if (line.startsWith('### ')) return <h3 key={i} className={styles.mdH3}>{render(line.slice(4))}</h3>
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className={styles.mdBold}>{render(line.slice(2,-2))}</p>
        if (line.startsWith('- '))   return <li key={i} className={styles.mdLi}>{render(line.slice(2))}</li>
        if (line.startsWith('---'))  return <hr key={i} className={styles.mdHr} />
        if (!line.trim())            return <div key={i} style={{ height: 6 }} />
        return <p key={i} className={styles.mdP}>{render(line)}</p>
      })}
    </div>
  )
}

// ── Score ATS — jauge circulaire ──────────────────────────────────────────────
function ATSGauge({ score, label }) {
  const r = 44
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? '#3cddc7' : score >= 60 ? '#7bd0ff' : score >= 40 ? '#f9c74f' : '#ff6b6b'
  const labelColor = { rejet: '#ff6b6b', possible: '#f9c74f', bon: '#7bd0ff', top: '#3cddc7' }[label] || '#7bd0ff'
  return (
    <div className={styles.atsGaugeWrap}>
      <svg width={108} height={108} viewBox="0 0 108 108">
        <circle cx={54} cy={54} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
        <circle
          cx={54} cy={54} r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 54 54)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text x={54} y={49} textAnchor="middle" fill={color}
          style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-headline)' }}>
          {Math.round(score)}
        </text>
        <text x={54} y={64} textAnchor="middle" fill="rgba(255,255,255,0.4)"
          style={{ fontSize: 10 }}>
          / 100
        </text>
      </svg>
      <span className={styles.atsLabel} style={{ color: labelColor }}>
        {{ rejet: '✗ Rejet auto', possible: '~ Possible', bon: '✓ Bon candidat', top: '★ Top candidat' }[label]}
      </span>
    </div>
  )
}

// ── Barre de score ATS ────────────────────────────────────────────────────────
function ScoreBar({ label, value, max, color }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className={styles.scoreBarRow}>
      <span className={styles.scoreBarLabel}>{label}</span>
      <div className={styles.scoreBarTrack}>
        <div className={styles.scoreBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.scoreBarValue}>{value}/{max}</span>
    </div>
  )
}

// ── Tableau mots-clés ─────────────────────────────────────────────────────────
function KeywordTable({ gaps }) {
  const [showAll, setShowAll] = useState(false)
  const IMPORTANCE_ORDER = { high: 0, medium: 1, low: 2 }
  const sorted = [...gaps].sort((a, b) => {
    if (a.found !== b.found) return a.found ? 1 : -1
    return (IMPORTANCE_ORDER[a.importance] ?? 1) - (IMPORTANCE_ORDER[b.importance] ?? 1)
  })
  const displayed = showAll ? sorted : sorted.slice(0, 10)
  const importanceLabel = { high: 'Obligatoire', medium: 'Important', low: 'Bonus' }
  const importanceColor = { high: '#ff6b6b', medium: '#f9c74f', low: '#7bd0ff' }
  const categoryLabel   = { skill: 'Compétence', tool: 'Outil', soft_skill: 'Soft skill', title: 'Titre', certification: 'Certif.' }

  return (
    <div className={styles.kwTable}>
      <div className={styles.kwTableHeader}>
        <span>Mot-clé</span>
        <span>Catégorie</span>
        <span>Poids</span>
        <span>Présent</span>
      </div>
      {displayed.map((k, i) => (
        <div key={i} className={`${styles.kwRow} ${k.found ? styles.kwFound : styles.kwMissing}`}>
          <span className={styles.kwName}>{k.keyword}</span>
          <span className={styles.kwCategory}>{categoryLabel[k.category] ?? k.category}</span>
          <span className={styles.kwImportance} style={{ color: importanceColor[k.importance] }}>
            {importanceLabel[k.importance] ?? k.importance}
          </span>
          <span className={styles.kwStatus}>
            {k.found
              ? <CheckCircle2 size={13} strokeWidth={2} style={{ color: '#3cddc7' }} />
              : <XCircle      size={13} strokeWidth={2} style={{ color: '#ff6b6b' }} />}
          </span>
        </div>
      ))}
      {gaps.length > 10 && (
        <button className={styles.kwShowMore} onClick={() => setShowAll(s => !s)}>
          {showAll ? <><ChevronUp size={11} /> Réduire</> : <><ChevronDown size={11} /> Voir les {gaps.length - 10} autres</>}
        </button>
      )}
    </div>
  )
}

// ── Panel résultat ATS ────────────────────────────────────────────────────────
function ATSPanel({ result, selCvId, selJobId, language, onSaved, savedId }) {
  const [tab, setTab] = useState('cv')
  const [diffMode, setDiffMode] = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saveErr, setSaveErr]   = useState(null)
  const hasDiff = !!result.source_cv_text
  const alreadySaved = !!savedId

  const handleSave = async () => {
    if (alreadySaved) return
    setSaving(true); setSaveErr(null)
    try {
      const saved = await saveATSCV({
        sourceCvId:    selCvId,
        jobId:         selJobId,
        language,
        cvMarkdown:    result.cv_markdown,
        sourceCvText:  result.source_cv_text,
        atsScore:      result.ats_score,
        keywordGaps:   result.keyword_gaps,
        suggestions:   result.suggestions,
      })
      onSaved(saved)
    } catch (err) {
      setSaveErr(err.detail ?? err.message ?? 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadMD = () => {
    if (!result.cv_markdown) return
    const blob = new Blob([result.cv_markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'CV_ATS_optimise.md'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadTXT = () => {
    if (!result.cv_markdown) return
    const txt = result.cv_markdown
      .replace(/^#{1,3} /gm, '').replace(/\*\*/g, '').replace(/^---$/gm, '─'.repeat(50))
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'CV_ATS_optimise.txt'; a.click()
    URL.revokeObjectURL(url)
  }

  const { ats_score: s } = result

  return (
    <div className={styles.atsPanel}>
      {/* Header */}
      <div className={styles.atsPanelHeader}>
        <div className={styles.atsPanelTitle}>
          <Target size={14} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />
          CV ATS Optimisé
          {alreadySaved && <span className={styles.atsSavedBadge}>✓ Sauvegardé</span>}
        </div>
        <div className={styles.atsTabs}>
          {[['cv', 'CV généré'], ['score', 'Score ATS'], ['keywords', `Mots-clés (${result.keyword_gaps.length})`]].map(([k, v]) => (
            <button key={k}
              className={`${styles.atsTab} ${tab === k ? styles.atsTabActive : ''}`}
              onClick={() => setTab(k)}>{v}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {tab === 'cv' && hasDiff && (
            <button
              className={`btn-ghost ${diffMode ? styles.diffBtnActive : ''}`}
              onClick={() => setDiffMode(d => !d)}
              style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <GitCompare size={11} strokeWidth={2} />
              {diffMode ? 'Diff ON' : 'Diff OFF'}
            </button>
          )}
          <button className="btn-ghost" onClick={handleDownloadTXT}
            style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download size={11} strokeWidth={2} /> .txt
          </button>
          <button className="btn-ghost" onClick={handleDownloadMD}
            style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download size={11} strokeWidth={2} /> .md
          </button>
          {/* Bouton Sauvegarder */}
          <button
            className={alreadySaved ? styles.btnSaveDone : styles.btnSave}
            onClick={handleSave}
            disabled={saving || alreadySaved}
            title={alreadySaved ? 'Déjà sauvegardé dans l\'historique' : 'Sauvegarder dans l\'historique'}
          >
            {saving
              ? <><Loader size={11} className={styles.spin} strokeWidth={2} /> Sauvegarde…</>
              : alreadySaved
                ? <><CheckCheck size={11} strokeWidth={2} /> Sauvegardé</>
                : <><Save size={11} strokeWidth={2} /> Sauvegarder</>
            }
          </button>
        </div>
      </div>

      {saveErr && (
        <div className={styles.errorBox} style={{ margin: '8px 20px' }}>
          <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} /> {saveErr}
        </div>
      )}

      {/* Contenu onglets */}
      <div className={styles.atsPanelBody}>

        {/* Onglet CV */}
        {tab === 'cv' && (
          <>
            {hasDiff && diffMode && (
              <div className={styles.diffLegend} style={{ borderRadius: 0 }}>
                <span className={styles.diffDot} />
                <span>Mots <span className={styles.diffNewInline}>en rouge</span> = ajoutés ou reformulés par l'IA pour optimiser le score ATS</span>
              </div>
            )}
            <div className={styles.cvPreview} style={{ padding: '24px 36px' }}>
              <MarkdownCV
                text={result.cv_markdown}
                sourceText={result.source_cv_text}
                diffMode={hasDiff && diffMode}
              />
            </div>
          </>
        )}

        {/* Onglet Score */}
        {tab === 'score' && (
          <div className={styles.atsScorePanel}>
            <div className={styles.atsScoreTop}>
              <ATSGauge score={s.total} label={s.label} />
              <div className={styles.atsScoreLegend}>
                <div className={styles.atsScoreLegendRow}><span style={{ color: '#ff6b6b' }}>■</span> 0–40 : Rejet automatique</div>
                <div className={styles.atsScoreLegendRow}><span style={{ color: '#f9c74f' }}>■</span> 40–60 : Shortlist possible</div>
                <div className={styles.atsScoreLegendRow}><span style={{ color: '#7bd0ff' }}>■</span> 60–80 : Bon candidat</div>
                <div className={styles.atsScoreLegendRow}><span style={{ color: '#3cddc7' }}>■</span> 80–100 : Top candidat</div>
              </div>
            </div>
            <div className={styles.atsScoreBars}>
              <ScoreBar label="Mots-clés"    value={s.score_keywords}   max={35} color="#7bd0ff" />
              <ScoreBar label="Expérience"   value={s.score_experience} max={25} color="#3cddc7" />
              <ScoreBar label="Compétences"  value={s.score_skills}     max={20} color="#a78bfa" />
              <ScoreBar label="Formation"    value={s.score_education}  max={10} color="#f9c74f" />
              <ScoreBar label="Format ATS"   value={s.score_format}     max={10} color="#fb923c" />
            </div>
            <div className={styles.atsScoreFormula}>
              <code>score = keywords×0.35 + expérience×0.25 + compétences×0.20 + formation×0.10 + format×0.10</code>
            </div>
            {result.suggestions?.length > 0 && (
              <div className={styles.atsSuggestions}>
                <div className={styles.atsSugTitle}>
                  <Lightbulb size={13} strokeWidth={2} style={{ color: '#f9c74f' }} />
                  Suggestions pour améliorer le score
                </div>
                {result.suggestions.map((sug, i) => (
                  <div key={i} className={styles.atsSugItem}>
                    <span className={styles.atsSugBullet}>→</span>
                    {sug}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Onglet Keywords */}
        {tab === 'keywords' && (
          <div className={styles.atsKeywordsPanel}>
            <div className={styles.kwSummary}>
              <div className={styles.kwSumItem} style={{ color: '#3cddc7' }}>
                <CheckCircle2 size={16} strokeWidth={2} />
                <strong>{result.found_count}</strong> présents
              </div>
              <div className={styles.kwSumItem} style={{ color: '#ff6b6b' }}>
                <XCircle size={16} strokeWidth={2} />
                <strong>{result.missing_count}</strong> manquants
              </div>
              <div className={styles.kwSumHint}>
                Les mots-clés manquants sont à ajouter manuellement si vous les possédez réellement.
              </div>
            </div>
            <KeywordTable gaps={result.keyword_gaps} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Carte CV généré ───────────────────────────────────────────────────────────
function GeneratedCard({ gen, onDelete, onSelect, selected, loading }) {
  const labelColor = gen.is_ats
    ? (gen.ats_total >= 80 ? '#3cddc7' : gen.ats_total >= 60 ? '#7bd0ff' : gen.ats_total >= 40 ? '#f9c74f' : '#ff6b6b')
    : null

  return (
    <div
      className={`${styles.genCard} ${selected ? styles.genCardActive : ''}`}
      onClick={() => onSelect(gen)}
    >
      <div className={styles.genCardHeader}>
        <div className={styles.genJobTitle}>{gen.job_title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading && <Loader size={11} className={styles.spin} strokeWidth={2} style={{ color: 'var(--primary)' }} />}
          {gen.is_ats && gen.ats_total != null && (
            <span className={styles.atsScoreBadge} style={{ color: labelColor, borderColor: labelColor + '55' }}>
              ATS {Math.round(gen.ats_total)}
            </span>
          )}
          <span className={styles.genDate}>
            {new Date(gen.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </span>
        </div>
      </div>
      <div className={styles.genCardMeta}>
        <span>{gen.job_company}</span>
        <span>CV : {gen.source_cv_name}</span>
        <span className={styles.genLang}>{gen.language === 'fr' ? '🇫🇷' : '🇬🇧'}</span>
      </div>
      {gen.notes && <p className={styles.genNotes}>{gen.notes}</p>}
      <div className={styles.genCardActions} onClick={e => e.stopPropagation()}>
        {gen.job_url && (
          <a href={gen.job_url} target="_blank" rel="noreferrer" className={styles.iconBtn} title="Voir l'offre">
            <ExternalLink size={12} strokeWidth={2} />
          </a>
        )}
        <button className={`${styles.iconBtn} ${styles.iconBtnDelete}`}
          onClick={() => onDelete(gen.id)} title="Supprimer">
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

// ── Reconstitue un ATSResult depuis un GeneratedCVFull sauvegardé ─────────────
function atsResultFromFull(full) {
  if (!full.is_ats) return null
  try {
    const atsScore    = full.ats_score_json       ? JSON.parse(full.ats_score_json)    : null
    const keywordGaps = full.ats_keywords_json    ? JSON.parse(full.ats_keywords_json) : []
    const suggestions = full.ats_suggestions_json ? JSON.parse(full.ats_suggestions_json) : []
    if (!atsScore) return null
    const found_count   = keywordGaps.filter(k => k.found).length
    const missing_count = keywordGaps.filter(k => !k.found).length
    return {
      cv_markdown:   full.cv_markdown,
      source_cv_text: full.source_cv_text,
      ats_score:     atsScore,
      keyword_gaps:  keywordGaps,
      found_count,
      missing_count,
      suggestions,
    }
  } catch { return null }
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function CVMatchingPage() {
  const { setOllamaStatus, clearOllamaStatus } = useOllamaStatus()
  const { data: cvList } = useAsync(fetchCVList, [], { fallback: [] })
  const { data: jobs }   = useAsync(
    () => fetchJobs({ limit: 200, sort_by: 'scraped_at', sort_order: 'desc' }),
    [], { fallback: [] }
  )
  const { data: genList, refetch: refetchGen } = useAsync(fetchGenerated, [], { fallback: [] })

  const [selCvId,    setSelCvId]    = useState('')
  const [selJobId,   setSelJobId]   = useState('')
  const [language,   setLanguage]   = useState('fr')

  // Mode actif : 'standard' | 'ats'
  const [activeMode, setActiveMode] = useState('standard')

  // Génération standard
  const [generating, setGenerating] = useState(false)
  const [genError,   setGenError]   = useState(null)
  const [viewGen,     setViewGen]     = useState(null)
  const [loadingView, setLoadingView] = useState(false)
  const [loadingId,   setLoadingId]   = useState(null)
  const [diffMode, setDiffMode] = useState(true)
  const [editNotes,   setEditNotes]   = useState(false)
  const [notesText,   setNotesText]   = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved,  setNotesSaved]  = useState(false)
  const [docxMsg, setDocxMsg] = useState(null)

  // Génération ATS
  const [generatingATS,      setGeneratingATS]      = useState(false)
  const [atsError,           setAtsError]           = useState(null)
  const [atsResult,          setAtsResult]          = useState(null)
  const [atsSavedId,         setAtsSavedId]         = useState(null)

  // Génération ATS Cloud
  const [generatingATSCloud, setGeneratingATSCloud] = useState(false)
  const [atsCloudError,      setAtsCloudError]      = useState(null)
  const [cloudStatus,        setCloudStatus]        = useState(null)  // { provider, model, configured }

  // AbortController partagé pour annuler toute génération en cours
  const abortRef = useRef(null)

  // Charger le statut Cloud au montage
  useEffect(() => {
    fetchCloudStatus().then(setCloudStatus).catch(() => setCloudStatus({ configured: false }))
  }, [])

  // Helpers export standard
  function download(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename.replace(/[^a-zA-Z0-9_\-. ]/g, '_'); a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportMD = () => {
    if (!viewGen?.cv_markdown) return
    const blob = new Blob([viewGen.cv_markdown], { type: 'text/markdown;charset=utf-8' })
    download(blob, `CV_${viewGen.job_company}_${viewGen.job_title}.md`)
  }

  const handleExportTXT = () => {
    if (!viewGen?.cv_markdown) return
    const txt = viewGen.cv_markdown
      .replace(/^#{1,3} /gm, '').replace(/\*\*/g, '').replace(/^---$/gm, '─'.repeat(50))
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    download(blob, `CV_${viewGen.job_company}_${viewGen.job_title}.txt`)
  }

  const handleExportDOCX = async () => {
    if (!viewGen) return
    setDocxMsg(null)
    const filename = `CV_${viewGen.job_company}_${viewGen.job_title}.docx`
    const result = await exportDocx(viewGen.id, filename)
    if (!result.ok) { setDocxMsg(result.message); handleExportMD() }
  }

  // Annuler toute génération en cours
  const handleCancel = () => {
    abortRef.current?.abort()
    abortRef.current = null
  }

  // Génération standard
  const handleGenerate = async () => {
    if (!selCvId || !selJobId) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setGenerating(true); setGenError(null); setActiveMode('standard')
    setOllamaStatus('CV Matching')
    try {
      const gen = await generateMatchingCV(parseInt(selCvId), parseInt(selJobId), language, null, ctrl.signal)
      await refetchGen()
      setViewGen(gen)
      setDiffMode(true)
    } catch (err) {
      if (err?.name !== 'AbortError' && !err?.message?.includes('aborted'))
        setGenError(err.detail ?? err.message ?? 'Erreur Ollama')
      else
        setGenError('Génération annulée.')
    } finally { setGenerating(false); clearOllamaStatus(); abortRef.current = null }
  }

  // Génération ATS local (Ollama)
  const handleGenerateATS = async () => {
    if (!selCvId || !selJobId) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setGeneratingATS(true); setAtsError(null); setActiveMode('ats')
    setAtsResult(null); setAtsSavedId(null)
    setOllamaStatus('CV Matching ATS')
    try {
      const result = await generateATSCV(parseInt(selCvId), parseInt(selJobId), language, null, ctrl.signal)
      setAtsResult(result)
    } catch (err) {
      if (err?.name !== 'AbortError' && !err?.message?.includes('aborted'))
        setAtsError(err.detail ?? err.message ?? 'Erreur Ollama ATS')
      else
        setAtsError('Génération annulée.')
    } finally { setGeneratingATS(false); clearOllamaStatus(); abortRef.current = null }
  }

  // Génération ATS Cloud (OpenRouter / Claude / OpenAI)
  const handleGenerateATSCloud = async () => {
    if (!selCvId || !selJobId) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setGeneratingATSCloud(true); setAtsCloudError(null); setActiveMode('ats')
    setAtsResult(null); setAtsSavedId(null)
    setOllamaStatus('CV Matching ATS Cloud')
    try {
      const result = await generateATSCloudCV(parseInt(selCvId), parseInt(selJobId), language, ctrl.signal)
      setAtsResult(result)
    } catch (err) {
      if (err?.name !== 'AbortError' && !err?.message?.includes('aborted'))
        setAtsCloudError(err.detail ?? err.message ?? 'Erreur ATS Cloud')
      else
        setAtsCloudError('Génération annulée.')
    } finally { setGeneratingATSCloud(false); clearOllamaStatus(); abortRef.current = null }
  }

  // Callback après sauvegarde ATS réussie
  const handleATSSaved = async (savedGen) => {
    setAtsSavedId(savedGen.id)
    await refetchGen()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce CV généré ?')) return
    await deleteGenerated(id)
    if (viewGen?.id === id)  setViewGen(null)
    if (atsSavedId === id)   setAtsSavedId(null)
    refetchGen()
  }

  // Sélection depuis l'historique
  const handleSelect = async (summary) => {
    if (loadingId === summary.id) return
    setLoadingId(summary.id)
    setLoadingView(true)
    setDocxMsg(null)
    try {
      const full = await fetchGeneratedOne(summary.id)

      if (full.is_ats) {
        // Restaurer le panel ATS depuis les données sauvegardées
        const restored = atsResultFromFull(full)
        if (restored) {
          setActiveMode('ats')
          setAtsResult(restored)
          setAtsSavedId(full.id)
          setSelCvId(full.source_cv_id ? String(full.source_cv_id) : selCvId)
          setSelJobId(full.job_id ? String(full.job_id) : selJobId)
          setLanguage(full.language || 'fr')
        } else {
          // Fallback : afficher comme CV standard si données ATS corrompues
          setActiveMode('standard')
          setViewGen(full)
          setAtsResult(null)
        }
      } else {
        setActiveMode('standard')
        setViewGen(full)
        setAtsResult(null)
        setAtsSavedId(null)
        setNotesText(full.notes ?? '')
        setEditNotes(false)
        setNotesSaved(false)
        setDiffMode(!!full.source_cv_text)
      }
    } catch (err) {
      console.error('[CVMatching] fetchGeneratedOne failed:', err)
    } finally {
      setLoadingView(false)
      setLoadingId(null)
    }
  }

  const handleSaveNotes = async () => {
    if (!viewGen) return
    setSavingNotes(true)
    try {
      const updated = await updateNotes(viewGen.id, notesText)
      setViewGen(updated); setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
      refetchGen()
    } finally { setSavingNotes(false) }
  }

  const hasDiff = !!(viewGen?.source_cv_text)

  return (
    <div className={styles.page}>
      <div className={styles.layout}>

        {/* ── Colonne gauche ── */}
        <div className={styles.leftCol}>
          <div className={styles.genForm}>
            <h2 className={`${styles.formTitle} font-headline`}>
              <Sparkles size={15} style={{ color: 'var(--tertiary)' }} strokeWidth={2} />
              Générer un CV adapté
            </h2>
            <p className={styles.formHint}>
              Ollama reformule votre CV pour maximiser le matching avec l'offre choisie.
            </p>

            <div className={styles.formRow}>
              <label className={styles.label}>CV source *</label>
              <select className={styles.select} value={selCvId} onChange={e => setSelCvId(e.target.value)}>
                <option value="">— Choisir un CV —</option>
                {(cvList ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!cvList?.length && <p className={styles.noDataHint}>Aucun CV — créez-en un dans <strong>CV</strong>.</p>}
            </div>

            <div className={styles.formRow}>
              <label className={styles.label}>Offre cible *</label>
              <select className={styles.select} value={selJobId} onChange={e => setSelJobId(e.target.value)}>
                <option value="">— Choisir une offre —</option>
                {(jobs ?? []).map((j, idx) => (
                  <option key={j.id} value={j.id}>#{idx + 1} · {j.title} · {j.company}</option>
                ))}
              </select>
              {!jobs?.length && <p className={styles.noDataHint}>Aucune offre — lancez un scraping.</p>}
            </div>

            <div className={styles.formRow}>
              <label className={styles.label}>Langue</label>
              <select className={styles.select} value={language} onChange={e => setLanguage(e.target.value)}>
                <option value="fr">🇫🇷 Français</option>
                <option value="en">🇬🇧 English</option>
              </select>
            </div>

            <div className={styles.genBtns}>
              <button className="btn-ghost"
                onClick={handleGenerate}
                disabled={!selCvId || !selJobId || generating || generatingATS || generatingATSCloud}
                style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                {generating
                  ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Génération… <ElapsedTimer running={generating} /></>
                  : <><Sparkles size={13} strokeWidth={2} /> Générer</>
                }
              </button>
              <button className={styles.btnATS}
                onClick={handleGenerateATS}
                disabled={!selCvId || !selJobId || generating || generatingATS || generatingATSCloud}
                title="Génère un CV optimisé ATS avec score et analyse des mots-clés (Ollama local)">
                {generatingATS
                  ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> ATS Local… <ElapsedTimer running={generatingATS} /></>
                  : <><Target size={13} strokeWidth={2} /> CV ATS LOCAL</>
                }
              </button>
              <button className={styles.btnATSCloud}
                onClick={handleGenerateATSCloud}
                disabled={!selCvId || !selJobId || generating || generatingATS || generatingATSCloud || !cloudStatus?.configured}
                title={cloudStatus?.configured
                  ? cloudStatus.provider === 'openrouter'
                    ? `Génère via OpenRouter (${cloudStatus.model})`
                    : `Génère via ${cloudStatus.provider === 'anthropic' ? 'Claude' : cloudStatus.provider === 'openai' ? 'OpenAI' : 'Mistral AI'} (${cloudStatus.model})`
                  : 'Configurez OpenRouter dans Paramètres, ou ANTHROPIC_API_KEY / OPENAI_API_KEY dans backend/.env'
                }>
                {generatingATSCloud
                  ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Cloud… <ElapsedTimer running={generatingATSCloud} /></>
                  : cloudStatus?.configured
                    ? <><Target size={13} strokeWidth={2} /> CV ATS CLOUD <span style={{fontSize:10, opacity:0.75}}>({cloudStatus.provider === 'openrouter' ? 'OpenRouter' : cloudStatus.provider === 'anthropic' ? 'Claude' : cloudStatus.provider === 'openai' ? 'GPT' : 'Mistral'})</span></>
                    : <><Target size={13} strokeWidth={2} /> CV ATS CLOUD <span style={{fontSize:10, opacity:0.5}}>(non configuré)</span></>
                }
              </button>
            </div>

            <div className={styles.genBtnsHint}>
              <span><strong>Générer</strong> — CV adapté, sauvegardé automatiquement</span>
              <span><strong>CV ATS LOCAL</strong> — Ollama local + score + mots-clés (GPU requis)</span>
              <span><strong>CV ATS CLOUD</strong> — {cloudStatus?.configured
                ? cloudStatus.provider === 'openrouter'
                  ? `OpenRouter (${cloudStatus.model}) — cloud gratuit, sans GPU`
                  : `${cloudStatus.provider === 'anthropic' ? 'Claude' : cloudStatus.provider === 'openai' ? 'OpenAI' : 'Mistral AI 🇫🇷'} (${cloudStatus.model}) — fonctionne sans GPU`
                : 'configurez OpenRouter dans Paramètres, ou ANTHROPIC_API_KEY / OPENAI_API_KEY dans .env'
              }</span>
            </div>

            {(generating || generatingATS || generatingATSCloud) && (
              <div className={styles.progressBar}>
                <div style={{ height: 3, background: 'linear-gradient(90deg,var(--primary),var(--tertiary))', borderRadius: 2, marginBottom: 6 }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ fontSize: 11, color: 'var(--outline)', fontStyle: 'italic', margin: 0 }}>
                    {generatingATSCloud
                      ? cloudStatus?.provider === 'openrouter'
                        ? `OpenRouter analyse et optimise le CV ATS… (10-30s)`
                        : `${cloudStatus?.provider === 'anthropic' ? 'Claude' : cloudStatus?.provider === 'openai' ? 'OpenAI' : 'Mistral AI'} analyse et optimise le CV ATS… (10-30s)`
                      : generatingATS ? 'Ollama analyse et optimise le CV ATS… (1-5 min)'
                      : "Ollama adapte le CV à l'offre… (1-5 min)"
                    }
                  </p>
                  <button
                    onClick={handleCancel}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, color: '#ff6b6b', background: 'rgba(255,107,107,0.1)',
                      border: '1px solid rgba(255,107,107,0.3)', borderRadius: 6,
                      padding: '3px 8px', cursor: 'pointer', flexShrink: 0,
                    }}
                    title="Annuler la génération en cours"
                  >
                    <X size={11} strokeWidth={2} /> Annuler
                  </button>
                </div>
              </div>
            )}

            {genError && (
              <div className={styles.errorBox}>
                <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} /> {genError}
              </div>
            )}
            {atsError && (
              <div className={styles.errorBox}>
                <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} /> ATS Local : {atsError}
              </div>
            )}
            {atsCloudError && (
              <div className={styles.errorBox}>
                <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} /> ATS Cloud : {atsCloudError}
              </div>
            )}
          </div>

          {/* Historique */}
          <div className={styles.historySection}>
            <h3 className={`${styles.histTitle} font-headline`}>Historique ({genList?.length ?? 0})</h3>
            {!genList?.length
              ? <p className={styles.emptyHist}>Aucun CV généré pour l'instant.</p>
              : <div className={styles.genList}>
                  {genList.map(g => (
                    <GeneratedCard key={g.id} gen={g}
                      onDelete={handleDelete}
                      onSelect={handleSelect}
                      selected={
                        (activeMode === 'standard' && viewGen?.id === g.id) ||
                        (activeMode === 'ats' && atsSavedId === g.id)
                      }
                      loading={loadingId === g.id}
                    />
                  ))}
                </div>
            }
          </div>
        </div>

        {/* ── Colonne droite ── */}
        <div className={styles.rightCol}>

          {loadingView && (
            <div className={styles.loadingView}>
              <Loader size={22} className={styles.spin} strokeWidth={1.5} style={{ color: 'var(--primary)' }} />
              <p>Chargement du CV…</p>
            </div>
          )}

          {/* État vide */}
          {!loadingView && activeMode === 'standard' && !viewGen && !generatingATS && !atsResult && (
            <div className={styles.emptyView}>
              <FileText size={40} strokeWidth={1} style={{ color: 'var(--outline)', marginBottom: 16 }} />
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 18, color: 'var(--on-surface)', marginBottom: 8 }}>
                CV Adapté
              </h2>
              <p style={{ fontSize: 13, color: 'var(--outline)', maxWidth: 340, textAlign: 'center', lineHeight: 1.5 }}>
                Cliquez sur <strong>Générer</strong> pour un CV adapté sauvegardé automatiquement,
                ou sur <strong>CV ATS</strong> pour un CV optimisé avec score et analyse des mots-clés.
              </p>
            </div>
          )}

          {/* Spinner ATS en cours (local ou cloud) */}
          {(generatingATS || generatingATSCloud) && !atsResult && (
            <div className={styles.loadingView}>
              <Target size={28} strokeWidth={1.5} style={{ color: 'var(--tertiary)' }} />
              <Loader size={22} className={styles.spin} strokeWidth={1.5} style={{ color: 'var(--tertiary)' }} />
              <p style={{ color: 'var(--tertiary)', fontWeight: 600 }}>Analyse ATS en cours…</p>
              <p style={{ fontSize: 11, color: 'var(--outline)' }}>
                Extraction des mots-clés · Reformulation des expériences · Simulation du score
              </p>
            </div>
          )}

          {/* Résultat ATS */}
          {!loadingView && activeMode === 'ats' && atsResult && (
            <ATSPanel
              result={atsResult}
              selCvId={parseInt(selCvId)}
              selJobId={parseInt(selJobId)}
              language={language}
              onSaved={handleATSSaved}
              savedId={atsSavedId}
            />
          )}

          {/* CV standard */}
          {!loadingView && activeMode === 'standard' && viewGen && (
            <>
              <div className={styles.viewToolbar}>
                <div>
                  <p className={styles.viewTitle}>{viewGen.job_title} · {viewGen.job_company}</p>
                  <p className={styles.viewMeta}>
                    CV source : {viewGen.source_cv_name} · {new Date(viewGen.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    {viewGen.ollama_model && <span> · {viewGen.ollama_model}</span>}
                  </p>
                </div>
                <div className={styles.exportBtns}>
                  {hasDiff && (
                    <button
                      className={`btn-ghost ${diffMode ? styles.diffBtnActive : ''}`}
                      onClick={() => setDiffMode(d => !d)}
                      title={diffMode ? 'Désactiver la vue diff' : 'Activer la vue diff'}
                      style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <GitCompare size={12} strokeWidth={2} />
                      {diffMode ? 'Diff ON' : 'Diff OFF'}
                    </button>
                  )}
                  <button className="btn-ghost" onClick={handleExportTXT}
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Download size={12} strokeWidth={2} /> .txt
                  </button>
                  <button className="btn-ghost" onClick={handleExportMD}
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Download size={12} strokeWidth={2} /> .md
                  </button>
                  <button className="btn-ghost" onClick={handleExportDOCX}
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Download size={12} strokeWidth={2} /> .docx
                  </button>
                  {viewGen.job_url && (
                    <a href={viewGen.job_url} target="_blank" rel="noreferrer"
                      className="btn-ghost"
                      style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                      <ExternalLink size={12} strokeWidth={2} /> Offre
                    </a>
                  )}
                  <button className={`btn-ghost ${styles.deleteViewBtn}`}
                    onClick={() => handleDelete(viewGen.id)} title="Supprimer">
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {hasDiff && diffMode && (
                <div className={styles.diffLegend}>
                  <span className={styles.diffDot} />
                  <span>Mots <span className={styles.diffNewInline}>en rouge</span> = absents du CV original (ajoutés par l'IA pour correspondre à l'offre)</span>
                </div>
              )}

              {docxMsg && (
                <div className={styles.docxFallback}>
                  <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>pandoc non disponible</strong> — le fichier .md a été téléchargé à la place.
                    Pour l'installer : <code>sudo apt install pandoc</code> puis redémarrez l'API.
                  </span>
                </div>
              )}

              <div className={styles.notesBar}>
                <button className={styles.notesToggle}
                  onClick={() => { setEditNotes(e => !e); setNotesText(viewGen.notes ?? '') }}>
                  <StickyNote size={12} strokeWidth={2} />
                  {editNotes ? 'Fermer les notes'
                    : (viewGen.notes ? `Note : ${viewGen.notes.slice(0, 60)}…` : 'Ajouter une note')}
                </button>
                {editNotes && (
                  <div className={styles.notesEdit}>
                    <textarea className={styles.notesTextarea} value={notesText}
                      onChange={e => setNotesText(e.target.value)}
                      placeholder="Notes sur ce CV, retours candidature…" rows={3} />
                    <button className="btn-ghost" onClick={handleSaveNotes} disabled={savingNotes}
                      style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                      {notesSaved ? <><CheckCheck size={12} strokeWidth={2} /> Sauvegardé</> : 'Sauvegarder la note'}
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.cvPreview}>
                <MarkdownCV
                  text={viewGen.cv_markdown}
                  sourceText={viewGen.source_cv_text}
                  diffMode={hasDiff && diffMode}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
