import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useOllamaStatus } from '../contexts/OllamaStatusContext.jsx'
import {
  Upload, Star, Trash2, Brain, CheckCircle, ChevronDown,
  Loader, AlertCircle, Clock, Save, CheckCheck,
  FileText, ArrowDownToLine, TriangleAlert, Eye, Zap, RefreshCw,
} from 'lucide-react'
import { useAsync }     from '../hooks/useAsync.js'
import { fetchCVs, uploadCV, deleteCV, updateCV, analyzeCV, importCVFromStore, previewCVPdf } from '../api/cvs.js'
import { fetchCVList }  from '../api/cvStore.js'
import { fetchJobs }    from '../api/jobs.js'
import { scoreJobSync, scoreJobOpenRouter } from '../api/analysis.js'
import { saveMatch }    from '../api/history.js'
import styles           from './AnalysisPage.module.css'

// ── Chronomètre ───────────────────────────────────────────────────────────────
function ElapsedTimer({ running }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!running) { setSecs(0); return }
    const id = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  if (!running) return null
  const m = Math.floor(secs / 60), s = secs % 60
  return (
    <span className={styles.timer}>
      <Clock size={10} strokeWidth={2} />
      {m > 0 ? `${m}m ` : ''}{s}s
    </span>
  )
}

// ── CVCard ────────────────────────────────────────────────────────────────────
function CVCard({ cv, onDelete, onSetDefault, onAnalyze, analyzing, analyzeError }) {
  let skills = []
  try { skills = JSON.parse(cv.skills || '[]') } catch { /* noop */ }
  const isAnalyzing = analyzing === cv.id
  const hasError    = analyzeError?.id === cv.id
  const isImported  = !cv.filepath || cv.filepath === ''

  return (
    <div className={`${styles.cvCard} ${cv.is_default ? styles.cvDefault : ''}`}>
      {cv.is_default && <span className={styles.defaultBadge}>✦ CV actif</span>}
      <div className={styles.cvHeader}>
        <div className={styles.cvIconWrap}>
          <span className={styles.cvIcon}>{isImported ? '📋' : 'CV'}</span>
        </div>
        <div className={styles.cvMeta}>
          <p className={styles.cvName}>{cv.name}</p>
          <p className={styles.cvFile}>
            {isImported
              ? <span className={styles.importedTag}>Importé depuis CV</span>
              : `${cv.filename} · ${cv.file_type.toUpperCase()}`
            }
          </p>
        </div>
      </div>
      {skills.length > 0 && (
        <div className={styles.skills}>
          {skills.slice(0, 10).map(s => <span key={s} className={styles.skill}>{s}</span>)}
          {skills.length > 10 && <span className={styles.skillMore}>+{skills.length - 10}</span>}
        </div>
      )}
      {!skills.length && cv.parsed_at && (
        <p className={styles.noSkills}>Aucune compétence extraite — cliquez sur Analyser.</p>
      )}
      {isAnalyzing && (
        <div className={styles.analyzeProgress}>
          <div className="neural-trace" style={{ height: 3, borderRadius: 2 }} />
          <div className={styles.analyzeMsg}>
            <Loader size={11} className={styles.spin} strokeWidth={2} />
            <span>Ollama extrait les compétences…</span>
            <ElapsedTimer running={isAnalyzing} />
          </div>
          <p className={styles.analyzeTip}>Selon votre matériel, cela peut prendre 1 à 5 minutes.</p>
        </div>
      )}
      {hasError && (
        <div className={styles.analyzeError}>
          <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span>{analyzeError.message}</span>
        </div>
      )}
      <div className={styles.cvActions}>
        <button className={`btn-ghost ${styles.actionBtn} ${isAnalyzing ? styles.actionBtnActive : ''}`}
          onClick={() => onAnalyze(cv.id)} disabled={isAnalyzing}>
          {isAnalyzing ? <Loader size={12} className={styles.spin} strokeWidth={2} /> : <Brain size={12} strokeWidth={2} />}
          {isAnalyzing ? 'En cours…' : 'Analyser'}
        </button>
        {!cv.is_default && (
          <button className={`btn-ghost ${styles.actionBtn}`} onClick={() => onSetDefault(cv.id)}>
            <Star size={12} strokeWidth={2} /> Activer
          </button>
        )}
        <button className={`btn-ghost ${styles.actionBtn} ${styles.actionDelete}`}
          onClick={() => onDelete(cv.id)} disabled={isAnalyzing}>
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

// ── ScoreResult ───────────────────────────────────────────────────────────────
function ScoreResult({ result, onSave, saving, saved }) {
  if (!result) return null
  const score = result.score ?? 0
  const color = score >= 80 ? 'var(--tertiary)' : score >= 60 ? 'var(--primary)' : 'var(--outline)'
  return (
    <div className={styles.scoreCard}>
      <div className={styles.scoreHeader}>
        <div className={styles.scoreCircle} style={{ borderColor: color }}>
          <span className={styles.scoreValue} style={{ color }}>{score}</span>
          <span className={styles.scorePct} style={{ color }}>/100</span>
        </div>
        <div style={{ flex: 1 }}>
          <p className={styles.scoreRec}>{result.recommendation}</p>
        </div>
      </div>
      <div className={styles.scoreGrid}>
        {result.strengths?.length > 0 && (
          <div className={styles.scoreSection}>
            <p className={styles.scoreSectionTitle} style={{ color: 'var(--tertiary)' }}>✦ Points forts</p>
            <ul className={styles.scoreList}>
              {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
        {result.gaps?.length > 0 && (
          <div className={styles.scoreSection}>
            <p className={styles.scoreSectionTitle} style={{ color: 'var(--primary)' }}>◎ Points de développement</p>
            <ul className={styles.scoreList}>
              {result.gaps.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </div>
        )}
      </div>
      <div className={styles.saveRow}>
        <button className={`btn-ghost ${styles.saveBtn} ${saved ? styles.saveBtnDone : ''}`}
          onClick={onSave} disabled={saving || saved}>
          {saved
            ? <><CheckCheck size={13} strokeWidth={2} /> Sauvegardé dans l'historique</>
            : saving
              ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Sauvegarde…</>
              : <><Save size={13} strokeWidth={2} /> Sauvegarder dans l'historique</>
          }
        </button>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const [searchParams] = useSearchParams()
  const jobIdFromUrl   = searchParams.get('job_id')
  const { setOllamaStatus, clearOllamaStatus } = useOllamaStatus()

  const { data: cvs, refetch: refetchCVs } = useAsync(fetchCVs, [], { fallback: [] })
  const { data: storedCVs } = useAsync(fetchCVList, [], { fallback: [] })

  const [analyzing,    setAnalyzing]    = useState(null)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [uploading,    setUploading]    = useState(false)
  const [uploadError,  setUploadError]  = useState(null)
  const [uploadName,   setUploadName]   = useState('')
  const [dragOver,     setDragOver]     = useState(false)
  const fileInputRef = useRef()

  const [importing,  setImporting]  = useState(null)
  const [importError, setImportError] = useState(null)
  const [importDone,  setImportDone]  = useState(null)

  // ── Modal de prévisualisation PDF ─────────────────────────────────────────
  const [pdfPreview,    setPdfPreview]    = useState(null)   // { file, text, warnings, char_count, line_count }
  const [previewing,    setPreviewing]    = useState(false)  // appel API en cours
  const [confirmingPdf, setConfirmingPdf] = useState(false)  // upload après confirmation

  // ── Même tri que le menu Offres : scraped_at DESC ─────────────────────────
  const { data: jobs } = useAsync(
    () => fetchJobs({ limit: 200, sort_by: 'scraped_at', sort_order: 'desc' }),
    [], { fallback: [] }
  )

  const [selectedJob,  setSelectedJob]  = useState(jobIdFromUrl ?? '')
  const [scoring,      setScoring]      = useState(false)
  const [scoreResult,  setScoreResult]  = useState(null)
  const [scoreError,   setScoreError]   = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)

  // ── OpenRouter ────────────────────────────────────────────────────────────
  const [orConfigured,    setOrConfigured]    = useState(false)
  const [orModels,        setOrModels]        = useState([])
  const [orModel,         setOrModel]         = useState('')
  const [orLoadingModels, setOrLoadingModels] = useState(false)
  const [scoringOR,       setScoringOR]       = useState(false)
  const [scoreResultOR,   setScoreResultOR]   = useState(null)
  const [scoreErrorOR,    setScoreErrorOR]    = useState(null)
  const [savingOR,        setSavingOR]        = useState(false)
  const [savedOR,         setSavedOR]         = useState(false)

  useEffect(() => {
    // Charger statut + modèle courant OpenRouter
    fetch('/api/settings/openrouter')
      .then(r => r.json())
      .then(d => {
        setOrConfigured(d.configured)
        if (d.model) setOrModel(d.model)
      })
      .catch(() => {})
    // Charger liste des modèles gratuits
    loadOrModels()
  }, [])

  const loadOrModels = async () => {
    setOrLoadingModels(true)
    try {
      const data = await fetch('/api/settings/openrouter/models').then(r => r.json())
      if (Array.isArray(data) && data.length > 0) {
        setOrModels(data)
        // Pré-sélectionner le premier modèle si aucun n'est défini
        setOrModel(prev => prev || data[0].id)
      }
    } catch { /* silence */ }
    finally { setOrLoadingModels(false) }
  }

  useEffect(() => { if (jobIdFromUrl) setSelectedJob(jobIdFromUrl) }, [jobIdFromUrl])

  const cameFromJobs   = !!jobIdFromUrl
  const preselectedJob = jobs?.find(j => String(j.id) === String(selectedJob))
  useEffect(() => { setSaved(false); setSavedOR(false) }, [selectedJob])

  // ── Upload fichier ────────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (file) => {
    if (!file) return
    // Pour les PDFs : appel preview d'abord, affichage modal si avertissements
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (isPdf) {
      setPreviewing(true); setUploadError(null)
      try {
        const preview = await previewCVPdf(file)
        if (preview.warnings?.length > 0) {
          // Il y a des avertissements → afficher la modal de validation
          setPdfPreview({ file, ...preview })
          return
        }
        // Pas d'avertissements → upload direct
        const name = uploadName.trim() || file.name.replace(/\.[^.]+$/, '')
        setUploading(true)
        await uploadCV(file, name)
        setUploadName('')
        await refetchCVs()
      } catch (err) {
        setUploadError(err.detail ?? err.message ?? 'Erreur analyse PDF')
      } finally {
        setPreviewing(false); setUploading(false)
      }
      return
    }
    // Fichiers non-PDF : upload direct
    const name = uploadName.trim() || file.name.replace(/\.[^.]+$/, '')
    setUploading(true); setUploadError(null)
    try { await uploadCV(file, name); setUploadName(''); await refetchCVs() }
    catch (err) { setUploadError(err.detail ?? err.message ?? 'Erreur upload') }
    finally { setUploading(false) }
  }, [uploadName, refetchCVs])

  // ── Confirmation de la modal PDF ──────────────────────────────────────────
  const handlePdfConfirm = useCallback(async () => {
    if (!pdfPreview) return
    const name = uploadName.trim() || pdfPreview.file.name.replace(/\.[^.]+$/, '')
    setConfirmingPdf(true); setUploadError(null)
    try {
      await uploadCV(pdfPreview.file, name)
      setUploadName('')
      setPdfPreview(null)
      await refetchCVs()
    } catch (err) {
      setUploadError(err.detail ?? err.message ?? 'Erreur upload')
    } finally { setConfirmingPdf(false) }
  }, [pdfPreview, uploadName, refetchCVs])

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  // ── Import depuis stored_cvs ──────────────────────────────────────────────
  const handleImportFromStore = useCallback(async (storeId, storeName) => {
    setImporting(storeId); setImportError(null); setImportDone(null)
    try {
      await importCVFromStore(storeId)
      await refetchCVs()
      setImportDone(`"${storeName}" importé avec succès — cliquez sur "Activer" pour l'utiliser.`)
      setTimeout(() => setImportDone(null), 5000)
    } catch (err) {
      setImportError(err.detail ?? err.message ?? 'Erreur import')
    } finally { setImporting(null) }
  }, [refetchCVs])

  // ── Gestion CVs ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Supprimer ce CV ?')) return
    try { await deleteCV(id); await refetchCVs() } catch (err) { console.error(err) }
  }, [refetchCVs])

  const handleSetDefault = useCallback(async (id) => {
    try { await updateCV(id, { is_default: true }); await refetchCVs() } catch (err) { console.error(err) }
  }, [refetchCVs])

  const handleAnalyze = useCallback(async (id) => {
    setAnalyzing(id); setAnalyzeError(null)
    setOllamaStatus('CV Intelligence — Extraction')
    try { await analyzeCV(id); await refetchCVs() }
    catch (err) { setAnalyzeError({ id, message: err.detail ?? err.message ?? "Erreur Ollama" }) }
    finally { setAnalyzing(null); clearOllamaStatus() }
  }, [refetchCVs])

  // ── Scoring ───────────────────────────────────────────────────────────────
  const defaultCV = cvs?.find(c => c.is_default)

  const handleScore = useCallback(async () => {
    if (!defaultCV || !selectedJob) return
    setScoring(true); setScoreResult(null); setScoreError(null); setSaved(false)
    setOllamaStatus('CV Intelligence — Scoring')
    try {
      const result = await scoreJobSync(defaultCV.id, parseInt(selectedJob, 10))
      setScoreResult(result)
    } catch (err) {
      setScoreError(err.detail ?? err.message ?? 'Erreur scoring Ollama')
    } finally { setScoring(false); clearOllamaStatus() }
  }, [defaultCV, selectedJob])

  const handleSave = useCallback(async () => {
    if (!scoreResult || !defaultCV || !selectedJob || saved) return
    setSaving(true)
    try {
      await saveMatch({
        cv_id: defaultCV.id, job_id: parseInt(selectedJob, 10),
        score: scoreResult.score, strengths: scoreResult.strengths ?? [],
        gaps: scoreResult.gaps ?? [], recommendation: scoreResult.recommendation ?? '',
        ollama_model: null,
      })
      setSaved(true)
    } catch (err) {
      setScoreError('Erreur sauvegarde : ' + (err.detail ?? err.message))
    } finally { setSaving(false) }
  }, [scoreResult, defaultCV, selectedJob, saved])

  // ── Score via OpenRouter ──────────────────────────────────────────────────
  const handleScoreOR = useCallback(async () => {
    if (!defaultCV || !selectedJob || !orModel) return
    setScoringOR(true); setScoreResultOR(null); setScoreErrorOR(null); setSavedOR(false)
    try {
      const result = await scoreJobOpenRouter(defaultCV.id, parseInt(selectedJob, 10), orModel)
      setScoreResultOR(result)
    } catch (err) {
      setScoreErrorOR(err.detail ?? err.message ?? 'Erreur OpenRouter')
    } finally { setScoringOR(false) }
  }, [defaultCV, selectedJob, orModel])

  const handleSaveOR = useCallback(async () => {
    if (!scoreResultOR || !defaultCV || !selectedJob || savedOR) return
    setSavingOR(true)
    try {
      await saveMatch({
        cv_id: defaultCV.id, job_id: parseInt(selectedJob, 10),
        score: scoreResultOR.score, strengths: scoreResultOR.strengths ?? [],
        gaps: scoreResultOR.gaps ?? [], recommendation: scoreResultOR.recommendation ?? '',
        ollama_model: orModel,
      })
      setSavedOR(true)
    } catch (err) {
      setScoreErrorOR('Erreur sauvegarde : ' + (err.detail ?? err.message))
    } finally { setSavingOR(false) }
  }, [scoreResultOR, defaultCV, selectedJob, savedOR, orModel])

  const importedNames = new Set((cvs ?? []).map(c => c.name))

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>CV Intelligence</h1>
          <p className={styles.pageSub}>Analyse sémantique CV ↔ offres via Ollama — 100% local, zéro cloud.</p>
        </div>
      </div>

      {cameFromJobs && preselectedJob && (
        <div className={styles.contextBanner}>
          <Brain size={13} strokeWidth={2} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span>
            Offre présélectionnée depuis la liste :{' '}
            <strong>{preselectedJob.title}</strong> · {preselectedJob.company}
            {' '}— activez un CV et cliquez sur "Analyser le match".
          </span>
        </div>
      )}

      <div className={styles.layout}>

        {/* ── Colonne gauche : CVs ── */}
        <div>
          <p className={styles.sectionTitle}>Mes CVs</p>

          {storedCVs && storedCVs.length > 0 && (
            <div className={styles.importPanel}>
              <div className={styles.importPanelHeader}>
                <ArrowDownToLine size={13} strokeWidth={2} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <div>
                  <p className={styles.importPanelTitle}>Importer depuis le menu CV</p>
                  <p className={styles.importPanelSub}>
                    Vos CVs créés dans le menu "CV" peuvent être utilisés ici directement.
                  </p>
                </div>
              </div>
              <div className={styles.importList}>
                {storedCVs.map(s => {
                  const alreadyImported = importedNames.has(s.name)
                  const isLoading       = importing === s.id
                  return (
                    <div key={s.id} className={styles.importItem}>
                      <div className={styles.importItemInfo}>
                        <FileText size={12} strokeWidth={2} style={{ color: 'var(--outline)', flexShrink: 0 }} />
                        <span className={styles.importItemName}>{s.name}</span>
                        {alreadyImported && (
                          <span className={styles.importItemDone}>
                            <CheckCircle size={11} strokeWidth={2} /> déjà importé
                          </span>
                        )}
                      </div>
                      {!alreadyImported && (
                        <button
                          className={styles.importBtn}
                          onClick={() => handleImportFromStore(s.id, s.name)}
                          disabled={isLoading}
                        >
                          {isLoading
                            ? <><Loader size={11} className={styles.spin} strokeWidth={2} /> Import…</>
                            : <><ArrowDownToLine size={11} strokeWidth={2} /> Importer</>
                          }
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {importDone && (
                <div className={styles.importSuccess}>
                  <CheckCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
                  {importDone}
                </div>
              )}
              {importError && (
                <div className={styles.importError}>
                  <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0 }} />
                  {importError}
                </div>
              )}
            </div>
          )}

          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropZoneOver : ''} ${(uploading || previewing) ? styles.dropZoneLoading : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !(uploading || previewing) && fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" style={{ display: 'none' }}
              onChange={e => handleFileSelect(e.target.files[0])} />
            {(uploading || previewing)
              ? <Loader size={24} strokeWidth={1.5} className={styles.spin} style={{ color: 'var(--primary)', marginBottom: 8 }} />
              : <Upload size={24} strokeWidth={1.5} style={{ color: 'var(--primary)', marginBottom: 8 }} />
            }
            <p className={styles.dropText}>
              {previewing ? 'Analyse du PDF en cours…' : uploading ? 'Upload en cours…' : 'Ou déposer un fichier CV ici'}
            </p>
            <p className={styles.dropHint}>PDF, TXT ou Markdown · max 10 MB</p>
          </div>
          {uploadError && (
            <div className={styles.uploadError}><AlertCircle size={12} strokeWidth={2} /> {uploadError}</div>
          )}
          <input className={styles.nameInput} type="text" placeholder="Nom du CV (optionnel)"
            value={uploadName} onChange={e => setUploadName(e.target.value)} />

          <div className={styles.cvList}>
            {!cvs?.length
              ? <p className={styles.emptyMsg}>Aucun CV chargé. Importez depuis le menu CV ou déposez un fichier.</p>
              : cvs.map(cv => (
                  <CVCard key={cv.id} cv={cv}
                    onDelete={handleDelete} onSetDefault={handleSetDefault}
                    onAnalyze={handleAnalyze} analyzing={analyzing} analyzeError={analyzeError}
                  />
                ))
            }
          </div>
        </div>

        {/* ── Colonne droite : Scoring ── */}
        <div>
          <p className={styles.sectionTitle}>Scoring IA</p>
          <div className={styles.scoringCard}>
            <div className={styles.scoringRow}>
              <label className={styles.scoringLabel}>CV sélectionné</label>
              {defaultCV
                ? <div className={styles.scoringValue}>
                    <CheckCircle size={13} style={{ color: 'var(--tertiary)' }} strokeWidth={2} />
                    {defaultCV.name}
                  </div>
                : <p className={styles.scoringHint}>Aucun CV actif — cliquez sur "Activer".</p>
              }
            </div>
            <div className={styles.scoringRow}>
              <label className={styles.scoringLabel}>
                Offre à analyser
                {cameFromJobs && selectedJob && (
                  <span className={styles.preselectTag}>✓ présélectionnée</span>
                )}
              </label>
              {!jobs?.length
                ? <p className={styles.scoringHint}>Aucune offre — lancez un scraping d'abord.</p>
                : <div className={styles.selectWrap}>
                    <select className={styles.select} value={selectedJob}
                      onChange={e => { setSelectedJob(e.target.value); setScoreResult(null) }}>
                      <option value="">— Choisir une offre —</option>
                      {/* ── Même ordre + même numérotation que le menu Offres ── */}
                      {(jobs ?? []).map((j, idx) => (
                        <option key={j.id} value={j.id}>
                          #{idx + 1} · {j.title} · {j.company}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={13} className={styles.selectIcon} strokeWidth={2} />
                  </div>
              }
            </div>
            {/* ── Bouton Ollama ── */}
            <button className={`btn-primary ${styles.scoreBtn}`}
              onClick={handleScore} disabled={!defaultCV || !selectedJob || scoring || scoringOR}>
              {scoring ? <Loader size={14} className={styles.spin} strokeWidth={2.5} /> : <Brain size={14} strokeWidth={2.5} />}
              {scoring ? 'Analyse en cours…' : 'Analyser le match'}
            </button>
            {scoring && (
              <div className={styles.scoringWait}>
                <div className="neural-trace" style={{ height: 3, marginBottom: 10 }} />
                <div className={styles.scoringWaitRow}>
                  <span className={styles.scoringWaitMsg}>Ollama compare le CV avec l'offre…</span>
                  <ElapsedTimer running={scoring} />
                </div>
                <p className={styles.scoringWaitTip}>Ollama travaille sur CPU — 1 à 5 minutes selon le modèle.</p>
              </div>
            )}
            {scoreError && (
              <div className={styles.scoreErrorBox}>
                <AlertCircle size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
                <span>{scoreError}</span>
              </div>
            )}

            {/* ── Séparateur ── */}
            <div className={styles.orSeparator}>
              <span className={styles.orSeparatorLine} />
              <span className={styles.orSeparatorLabel}>ou via OpenRouter</span>
              <span className={styles.orSeparatorLine} />
            </div>

            {/* ── Sélecteur de modèle OpenRouter ── */}
            <div className={styles.orModelRow}>
              <label className={styles.orModelLabel}>
                <Zap size={12} strokeWidth={2} style={{ color: '#f97316' }} />
                Modèle OpenRouter
              </label>
              <div className={styles.orModelInputWrap}>
                {orModels.length > 0 ? (
                  <select
                    className={styles.orModelSelect}
                    value={orModel}
                    onChange={e => setOrModel(e.target.value)}
                    disabled={scoringOR}
                  >
                    {orModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name || m.id}</option>
                    ))}
                    {orModel && !orModels.find(m => m.id === orModel) && (
                      <option value={orModel}>{orModel}</option>
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    className={styles.orModelInput}
                    value={orModel}
                    onChange={e => setOrModel(e.target.value)}
                    placeholder="deepseek/deepseek-r1:free"
                    disabled={scoringOR}
                  />
                )}
                <button
                  className={styles.orRefreshBtn}
                  onClick={loadOrModels}
                  disabled={orLoadingModels || scoringOR}
                  title="Rafraîchir les modèles depuis OpenRouter">
                  {orLoadingModels
                    ? <Loader size={13} className={styles.spin} strokeWidth={2} />
                    : <RefreshCw size={13} strokeWidth={2} />}
                </button>
              </div>
              {orModels.length > 0 && (
                <p className={styles.orModelCount}>{orModels.length} modèles gratuits disponibles</p>
              )}
            </div>

            {/* ── Bouton OpenRouter ── */}
            <button
              className={styles.scoreBtnOR}
              onClick={handleScoreOR}
              disabled={!defaultCV || !selectedJob || !orModel || scoringOR || scoring}
              title={!orConfigured ? 'Configurez OpenRouter dans Paramètres' : ''}
            >
              {scoringOR
                ? <><Loader size={14} className={styles.spin} strokeWidth={2.5} /> Analyse en cours…</>
                : <><Zap size={14} strokeWidth={2.5} /> Analyser le match via OpenRouter</>}
            </button>
            {!orConfigured && orModel && (
              <p className={styles.orNotConfigured}>
                <AlertCircle size={11} strokeWidth={2} /> Clé OpenRouter non configurée —{' '}
                <a href="/settings" className={styles.orLink}>Paramètres → OpenRouter</a>
              </p>
            )}
            {scoringOR && (
              <div className={styles.scoringWait} style={{ borderColor: 'rgba(249,115,22,0.2)', background: 'rgba(249,115,22,0.04)' }}>
                <div className={styles.scoringWaitRow}>
                  <span className={styles.scoringWaitMsg}>
                    <Zap size={11} strokeWidth={2} style={{ color: '#f97316' }} />
                    OpenRouter · {orModel?.split('/')[1] ?? orModel} analyse le match…
                  </span>
                  <ElapsedTimer running={scoringOR} />
                </div>
              </div>
            )}
            {scoreErrorOR && (
              <div className={styles.scoreErrorBox}>
                <AlertCircle size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
                <span>{scoreErrorOR}</span>
              </div>
            )}
          </div>

          {/* Résultat Ollama */}
          {scoreResult && (
            <ScoreResult result={scoreResult} onSave={handleSave} saving={saving} saved={saved} />
          )}

          {/* Résultat OpenRouter */}
          {scoreResultOR && (
            <div className={styles.orResultWrapper}>
              <div className={styles.orResultBadge}>
                <Zap size={11} strokeWidth={2} /> OpenRouter · {scoreResultOR.model_used?.split('/')[1] ?? scoreResultOR.model_used}
              </div>
              <ScoreResult result={scoreResultOR} onSave={handleSaveOR} saving={savingOR} saved={savedOR} />
            </div>
          )}

          <div className={styles.infoBox}>
            <p className={styles.infoTitle}>⚡ Mode synchrone</p>
            <p className={styles.infoText}>
              <strong>Ollama</strong> : modèle local — 1 à 5 min selon le matériel.<br />
              <strong>OpenRouter</strong> : modèles cloud gratuits — résultat en 10–30 s · Configurez votre clé dans Paramètres.
            </p>
          </div>
        </div>
      </div>

      {/* ── Modal de prévisualisation PDF ── */}
      {pdfPreview && (
        <div className={styles.modalOverlay} onClick={() => !confirmingPdf && setPdfPreview(null)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <TriangleAlert size={16} strokeWidth={2} style={{ color: '#f59e0b', flexShrink: 0 }} />
              <div>
                <p className={styles.modalTitle}>Vérification du PDF avant import</p>
                <p className={styles.modalSub}>
                  {pdfPreview.char_count} caractères · {pdfPreview.line_count} lignes
                </p>
              </div>
            </div>

            <div className={styles.modalWarnings}>
              {pdfPreview.warnings.map((w, i) => (
                <div key={i} className={styles.modalWarningItem}>
                  <AlertCircle size={12} strokeWidth={2} style={{ flexShrink: 0, color: '#f59e0b' }} />
                  <span>{w}</span>
                </div>
              ))}
            </div>

            <div className={styles.modalPreviewHeader}>
              <Eye size={12} strokeWidth={2} style={{ color: 'var(--outline)' }} />
              <span>Aperçu du texte extrait</span>
            </div>
            <pre className={styles.modalPreviewText}>
              {pdfPreview.text.slice(0, 2000)}{pdfPreview.text.length > 2000 ? '\n\n[… texte tronqué pour l\'aperçu]' : ''}
            </pre>

            <div className={styles.modalActions}>
              <button
                className={`btn-ghost ${styles.modalCancel}`}
                onClick={() => setPdfPreview(null)}
                disabled={confirmingPdf}
              >
                Annuler
              </button>
              <button
                className={`btn-primary ${styles.modalConfirm}`}
                onClick={handlePdfConfirm}
                disabled={confirmingPdf}
              >
                {confirmingPdf
                  ? <><Loader size={13} className={styles.spin} strokeWidth={2} /> Import en cours…</>
                  : <><CheckCircle size={13} strokeWidth={2} /> Confirmer l'import</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
