import { useEffect, useState } from 'react'
import {
  Sparkles, Trash2, Download, FileText, Loader,
  AlertCircle, Clock, ExternalLink, StickyNote, CheckCheck,
} from 'lucide-react'
import { useAsync }    from '../hooks/useAsync.js'
import { fetchCVList } from '../api/cvStore.js'
import { fetchJobs }   from '../api/jobs.js'
import {
  fetchGenerated, generateMatchingCV, deleteGenerated,
  updateNotes, exportDocx,
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

// ── Rendu Markdown ────────────────────────────────────────────────────────────
function MarkdownCV({ text }) {
  if (!text) return null
  return (
    <div className={styles.cvMarkdown}>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('# '))   return <h1 key={i} className={styles.mdH1}>{line.slice(2)}</h1>
        if (line.startsWith('## '))  return <h2 key={i} className={styles.mdH2}>{line.slice(3)}</h2>
        if (line.startsWith('### ')) return <h3 key={i} className={styles.mdH3}>{line.slice(4)}</h3>
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className={styles.mdBold}>{line.slice(2,-2)}</p>
        if (line.startsWith('- '))   return <li key={i} className={styles.mdLi}>{line.slice(2)}</li>
        if (line.startsWith('---'))  return <hr key={i} className={styles.mdHr} />
        if (!line.trim())            return <div key={i} style={{ height: 6 }} />
        return <p key={i} className={styles.mdP}>{line}</p>
      })}
    </div>
  )
}

// ── Carte CV généré ───────────────────────────────────────────────────────────
function GeneratedCard({ gen, onDelete, onSelect, selected }) {
  return (
    <div
      className={`${styles.genCard} ${selected ? styles.genCardActive : ''}`}
      onClick={() => onSelect(gen)}
    >
      <div className={styles.genCardHeader}>
        <div className={styles.genJobTitle}>{gen.job_title}</div>
        <span className={styles.genDate}>
          {new Date(gen.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
        </span>
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

// ── Page principale ───────────────────────────────────────────────────────────
export default function CVMatchingPage() {
  const { data: cvList } = useAsync(fetchCVList, [], { fallback: [] })
  const { data: jobs }   = useAsync(
    () => fetchJobs({ limit: 100, sort_by: 'published_at', sort_order: 'desc' }),
    [], { fallback: [] }
  )
  const { data: genList, refetch: refetchGen } = useAsync(fetchGenerated, [], { fallback: [] })

  const [selCvId,    setSelCvId]    = useState('')
  const [selJobId,   setSelJobId]   = useState('')
  const [language,   setLanguage]   = useState('fr')
  const [generating, setGenerating] = useState(false)
  const [genError,   setGenError]   = useState(null)
  const [viewGen,    setViewGen]    = useState(null)

  // Notes
  const [editNotes,   setEditNotes]   = useState(false)
  const [notesText,   setNotesText]   = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved,  setNotesSaved]  = useState(false)

  // Export DOCX — message retour pandoc
  const [docxMsg, setDocxMsg] = useState(null)

  // ── Helpers export ────────────────────────────────────────────────────────
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
      .replace(/^#{1,3} /gm, '')
      .replace(/\*\*/g, '')
      .replace(/^---$/gm, '─'.repeat(50))
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    download(blob, `CV_${viewGen.job_company}_${viewGen.job_title}.txt`)
  }

  const handleExportDOCX = async () => {
    if (!viewGen) return
    setDocxMsg(null)
    const filename = `CV_${viewGen.job_company}_${viewGen.job_title}.docx`
    const result = await exportDocx(viewGen.id, filename)
    if (!result.ok) {
      // pandoc absent → fallback gracieux
      setDocxMsg(result.message)
      // Télécharger quand même le .md comme fallback
      handleExportMD()
    }
  }

  // ── Génération ────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selCvId || !selJobId) return
    setGenerating(true); setGenError(null)
    try {
      const gen = await generateMatchingCV(parseInt(selCvId), parseInt(selJobId), language)
      await refetchGen()
      setViewGen(gen)
    } catch (err) {
      setGenError(err.detail ?? err.message ?? 'Erreur Ollama')
    } finally { setGenerating(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce CV généré ?')) return
    await deleteGenerated(id)
    if (viewGen?.id === id) setViewGen(null)
    refetchGen()
  }

  const handleSelect = (gen) => {
    setViewGen(gen)
    setNotesText(gen.notes ?? '')
    setEditNotes(false)
    setNotesSaved(false)
    setDocxMsg(null)
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

  // ── Rendu ─────────────────────────────────────────────────────────────────
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
              Le résultat est sauvegardé automatiquement.
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
                {(jobs ?? []).map(j => <option key={j.id} value={j.id}>{j.title} · {j.company}</option>)}
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

            <button className="btn-primary"
              onClick={handleGenerate} disabled={!selCvId || !selJobId || generating}
              style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
              {generating
                ? <><Loader size={14} className={styles.spin} strokeWidth={2} /> Génération… <ElapsedTimer running={generating} /></>
                : <><Sparkles size={14} strokeWidth={2} /> Générer le CV</>
              }
            </button>

            {generating && (
              <div className={styles.progressBar}>
                <div style={{ height: 3, background: 'linear-gradient(90deg,var(--primary),var(--tertiary))', borderRadius: 2, marginBottom: 6 }} />
                <p style={{ fontSize: 11, color: 'var(--outline)', fontStyle: 'italic' }}>
                  Ollama adapte le CV à l'offre… (1-5 min)
                </p>
              </div>
            )}

            {genError && (
              <div className={styles.errorBox}>
                <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} /> {genError}
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
                      onDelete={handleDelete} onSelect={handleSelect}
                      selected={viewGen?.id === g.id} />
                  ))}
                </div>
            }
          </div>
        </div>

        {/* ── Colonne droite : visualisation ── */}
        <div className={styles.rightCol}>
          {!viewGen ? (
            <div className={styles.emptyView}>
              <FileText size={40} strokeWidth={1} style={{ color: 'var(--outline)', marginBottom: 16 }} />
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 18, color: 'var(--on-surface)', marginBottom: 8 }}>
                CV Adapté
              </h2>
              <p style={{ fontSize: 13, color: 'var(--outline)', maxWidth: 340, textAlign: 'center', lineHeight: 1.5 }}>
                Générez un CV ou sélectionnez-en un dans l'historique pour le visualiser et l'exporter.
              </p>
            </div>
          ) : (
            <>
              {/* Barre d'actions */}
              <div className={styles.viewToolbar}>
                <div>
                  <p className={styles.viewTitle}>{viewGen.job_title} · {viewGen.job_company}</p>
                  <p className={styles.viewMeta}>
                    CV : {viewGen.source_cv_name} · {new Date(viewGen.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    {viewGen.ollama_model && <span> · {viewGen.ollama_model}</span>}
                  </p>
                </div>
                <div className={styles.exportBtns}>
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

              {/* Message pandoc absent → fallback .md téléchargé */}
              {docxMsg && (
                <div className={styles.docxFallback}>
                  <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>pandoc non disponible</strong> — le fichier .md a été téléchargé à la place.
                    Pour l'installer : <code>sudo apt install pandoc</code> puis redémarrez l'API.
                  </span>
                </div>
              )}

              {/* Notes */}
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

              {/* CV affiché */}
              <div className={styles.cvPreview}>
                <MarkdownCV text={viewGen.cv_markdown} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
