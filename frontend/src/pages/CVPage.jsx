import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Plus, Upload, Trash2, Save, ChevronDown, ChevronUp,
  FileText, Loader, AlertCircle, CheckCheck, Edit3, Zap, Bot, Timer,
  CheckSquare, Square, X,
} from 'lucide-react'
import { useAsync }  from '../hooks/useAsync.js'
import { fetchCVList, fetchCVDetail, createCV, updateCV, deleteCV, importPDF } from '../api/cvStore.js'
import styles from './CVPage.module.css'

// ── Textarea auto-resize ──────────────────────────────────────────────────────
function AutoTextarea({ value, onChange, placeholder, minRows = 4 }) {
  const ref = useRef()
  useEffect(() => {
    if (!ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = ref.current.scrollHeight + 'px'
  }, [value])
  return (
    <textarea
      ref={ref}
      className={styles.textarea}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
    />
  )
}

// ── Section accordéon ─────────────────────────────────────────────────────────
function Section({ title, hint, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(o => !o)}>
        <span className={styles.sectionTitle}>{title}</span>
        {open ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
      </button>
      {open && (
        <div className={styles.sectionBody}>
          {hint && <p className={styles.hint}>{hint}</p>}
          {children}
        </div>
      )}
    </div>
  )
}

// ── Champ simple ──────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input type={type} className={styles.input}
        value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

// ── Éditeur de CV ─────────────────────────────────────────────────────────────
function CVEditor({ cv, onSaved, onDelete }) {
  const [form, setForm]   = useState({ ...cv })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [deleting, setDeleting] = useState(false)
  const set = key => val => setForm(f => ({ ...f, [key]: val }))

  useEffect(() => { setForm({ ...cv }); setSaved(false) }, [cv.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateCV(cv.id, form)
      onSaved(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Supprimer le CV "${cv.name}" ? Cette action est irréversible.`)) return
    setDeleting(true)
    try { await deleteCV(cv.id); onDelete(cv.id) }
    finally { setDeleting(false) }
  }

  return (
    <div className={styles.editor}>
      {/* Nom du CV */}
      <div className={styles.editorHeader}>
        <div className={styles.editorTitleRow}>
          <Edit3 size={14} style={{ color: 'var(--primary)' }} strokeWidth={2} />
          <input
            className={styles.cvNameInput}
            value={form.name ?? ''}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Nom du CV…"
          />
        </div>
        <p className={styles.editorMeta}>
          Créé le {new Date(cv.created_at).toLocaleDateString('fr-FR')} à {new Date(cv.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}
          {cv.source_pdf && <span className={styles.pdfBadge}>📄 Importé depuis PDF</span>}
        </p>
      </div>

      {/* Section Identité */}
      <Section title="👤 Identité" defaultOpen>
        <div className={styles.grid2}>
          <Field label="Nom complet"  value={form.full_name}    onChange={set('full_name')}    placeholder="Alexis Turing" />
          <Field label="Titre"        value={form.title}        onChange={set('title')}        placeholder="Développeur Python Senior" />
          <Field label="Email"        value={form.email}        onChange={set('email')}        placeholder="vous@email.com" type="email" />
          <Field label="Téléphone"    value={form.phone}        onChange={set('phone')}        placeholder="+33 6 xx xx xx xx" />
          <Field label="Localisation" value={form.location}     onChange={set('location')}     placeholder="Paris, France" />
          <Field label="LinkedIn"     value={form.linkedin_url} onChange={set('linkedin_url')} placeholder="https://linkedin.com/in/..." />
          <Field label="GitHub"       value={form.github_url}   onChange={set('github_url')}   placeholder="https://github.com/..." />
          <Field label="Site web"     value={form.website_url}  onChange={set('website_url')}  placeholder="https://..." />
        </div>
      </Section>

      {/* Résumé */}
      <Section title="📝 Résumé professionnel"
        hint="2-4 phrases qui décrivent votre profil, vos forces principales et votre valeur ajoutée.">
        <AutoTextarea value={form.summary} onChange={set('summary')}
          placeholder="Développeur passionné avec 5 ans d'expérience dans la conception d'architectures scalables…"
          minRows={4} />
      </Section>

      {/* Expériences */}
      <Section title="💼 Expériences professionnelles"
        hint="Format Markdown libre. Chaque expérience sur autant de lignes que nécessaire. Pas de limite.">
        <AutoTextarea value={form.experiences} onChange={set('experiences')}
          placeholder={"## Lead Développeur Python · Startup XYZ (2021 – 2024)\n- Architecture microservices FastAPI + PostgreSQL\n- Réduction des temps de réponse API de 60%\n- Management d'une équipe de 3 développeurs\n\n## Développeur Backend · Agence ABC (2019 – 2021)\n- Développement d'APIs REST Django\n- Intégration de services tiers (Stripe, Twilio)"}
          minRows={8} />
      </Section>

      {/* Compétences */}
      <Section title="⚡ Compétences techniques"
        hint="Listez vos compétences séparées par des virgules, ou en Markdown par catégorie.">
        <AutoTextarea value={form.skills} onChange={set('skills')}
          placeholder={"Python, FastAPI, Django, Flask, React, TypeScript, Docker, Kubernetes, PostgreSQL, Redis, Git, AWS, Linux"}
          minRows={3} />
      </Section>

      {/* Formation */}
      <Section title="🎓 Formation"
        hint="Vos diplômes et formations, du plus récent au plus ancien.">
        <AutoTextarea value={form.education} onChange={set('education')}
          placeholder={"## Master Informatique · Université Paris (2019)\nSpécialisation Systèmes distribués\n\n## Licence Informatique · IUT Lyon (2017)"}
          minRows={4} />
      </Section>

      {/* Langues */}
      <Section title="🌍 Langues">
        <AutoTextarea value={form.languages} onChange={set('languages')}
          placeholder={"Français (natif)\nAnglais (C1 — courant professionnel)\nEspagnol (B1 — notions)"}
          minRows={3} />
      </Section>

      {/* Certifications */}
      <Section title="🏆 Certifications">
        <AutoTextarea value={form.certifications} onChange={set('certifications')}
          placeholder={"AWS Certified Developer – Associate (2023)\nDocker Certified Associate (2022)"}
          minRows={3} />
      </Section>

      {/* Projets */}
      <Section title="🚀 Projets personnels">
        <AutoTextarea value={form.projects} onChange={set('projects')}
          placeholder={"## Postulator (2025)\nAgrégateur de recherche d'emploi open source (React + FastAPI + Ollama)\nhttps://github.com/nouhailler/postulator"}
          minRows={4} />
      </Section>

      {/* Centres d'intérêt */}
      <Section title="🎯 Centres d'intérêt">
        <AutoTextarea value={form.interests} onChange={set('interests')}
          placeholder={"Open source, IA locale, escalade, photographie"}
          minRows={2} />
      </Section>

      {/* Barre d'actions */}
      <div className={styles.actionBar}>
        <button className={`btn-ghost ${styles.deleteBtn}`} onClick={handleDelete} disabled={deleting}>
          <Trash2 size={13} strokeWidth={2} />
          {deleting ? 'Suppression…' : 'Supprimer'}
        </button>
        <button
          className={`btn-primary ${saved ? styles.savedBtn : ''}`}
          onClick={handleSave} disabled={saving}
        >
          {saved
            ? <><CheckCheck size={14} strokeWidth={2} /> Sauvegardé</>
            : saving
              ? <><Loader size={14} className={styles.spin} strokeWidth={2} /> Sauvegarde…</>
              : <><Save size={14} strokeWidth={2} /> Sauvegarder</>
          }
        </button>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function CVPage() {
  const { data: cvList, refetch: refetchList } = useAsync(fetchCVList, [], { fallback: [] })
  const [selectedId,  setSelectedId]  = useState(null)
  const [currentCV,   setCurrentCV]   = useState(null)
  const [loadingCV,   setLoadingCV]   = useState(false)

  // Import PDF
  const [importing,   setImporting]   = useState(false)
  const [importError, setImportError] = useState(null)
  const [importName,  setImportName]  = useState('')
  const [elapsed,     setElapsed]     = useState(0)
  const [aiProvider,   setAiProvider]   = useState('auto') // 'auto' | 'ollama' | 'openrouter'
  const [orConfigured, setOrConfigured] = useState(false)
  // Mode sélection multiple
  const [selectMode,   setSelectMode]   = useState(false)
  const [selected,     setSelected]     = useState(new Set()) // Set d'ids
  const [deleting,     setDeleting]     = useState(false)
  const fileInputRef  = useRef()

  // Vérifier si OpenRouter est configuré au montage
  useEffect(() => {
    fetch('/api/settings/openrouter').then(r => r.json())
      .then(d => setOrConfigured(!!(d?.configured)))
      .catch(() => setOrConfigured(false))
  }, [])

  // Chrono import
  useEffect(() => {
    if (!importing) { setElapsed(0); return }
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [importing])

  // Charger le détail quand on sélectionne
  useEffect(() => {
    if (!selectedId) { setCurrentCV(null); return }
    setLoadingCV(true)
    fetchCVDetail(selectedId)
      .then(cv => { setCurrentCV(cv) })
      .catch(console.error)
      .finally(() => setLoadingCV(false))
  }, [selectedId])

  // Nouveau CV vide
  const handleNew = async () => {
    const name = `Mon CV — ${new Date().toLocaleDateString('fr-FR')}`
    const cv = await createCV(name)
    await refetchList()
    setSelectedId(cv.id)
  }

  // Import PDF
  const handleImport = useCallback(async (file) => {
    if (!file) return
    const name = importName.trim() || file.name.replace(/\.[^.]+$/, '') + ` — ${new Date().toLocaleDateString('fr-FR')}`
    setImporting(true); setImportError(null)
    try {
      const cv = await importPDF(file, name, { provider: aiProvider })
      await refetchList()
      setSelectedId(cv.id)
      setImportName('')
    } catch (err) {
      setImportError(err.message)
    } finally { setImporting(false) }
  }, [importName, aiProvider, refetchList])

  const handleSaved = (updated) => {
    setCurrentCV(updated)
    refetchList()
  }

  const handleDelete = (id) => {
    setSelectedId(null)
    setCurrentCV(null)
    refetchList()
  }

  // Suppression rapide depuis la liste (un seul CV)
  const handleDeleteOne = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Supprimer ce CV ?')) return
    await deleteCV(id)
    if (selectedId === id) { setSelectedId(null); setCurrentCV(null) }
    refetchList()
  }

  // Suppression multiple
  const toggleSelect = (e, id) => {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === cvList?.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(cvList.map(c => c.id)))
    }
  }

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`Supprimer ${selected.size} CV${selected.size > 1 ? 's' : ''} ? Cette action est irréversible.`)) return
    setDeleting(true)
    try {
      await Promise.all([...selected].map(id => deleteCV(id)))
      if (selected.has(selectedId)) { setSelectedId(null); setCurrentCV(null) }
      setSelected(new Set())
      setSelectMode(false)
      await refetchList()
    } finally { setDeleting(false) }
  }

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>

        {/* ── Colonne gauche : liste ── */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2 className={`${styles.sideTitle} font-headline`}>Mes CVs</h2>
            <span className={styles.cvCount}>{cvList?.length ?? 0}</span>
            {cvList?.length > 0 && !selectMode && (
              <button
                className={styles.selectModeBtn}
                onClick={() => setSelectMode(true)}
                title="Sélectionner plusieurs CVs pour les supprimer"
              >
                <CheckSquare size={12} strokeWidth={2} /> Sélectionner
              </button>
            )}
            {selectMode && (
              <button className={styles.cancelSelectBtn} onClick={exitSelectMode} title="Annuler">
                <X size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* ── Barre de sélection multiple ── */}
          {selectMode && (
            <div className={styles.selectBar}>
              <button className={styles.selectAllBtn} onClick={toggleSelectAll}>
                {selected.size === cvList?.length
                  ? <CheckSquare size={12} strokeWidth={2} />
                  : <Square size={12} strokeWidth={2} />}
                {selected.size === cvList?.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
              {selected.size > 0 && (
                <button
                  className={styles.deleteSelectedBtn}
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                >
                  {deleting
                    ? <><Loader size={11} strokeWidth={2} className={styles.spin} /> Suppression…</>
                    : <><Trash2 size={11} strokeWidth={2} /> Supprimer ({selected.size})</>}
                </button>
              )}
            </div>
          )}

          {/* Boutons d'action */}
          <div className={styles.sideActions}>
            <button className="btn-primary" onClick={handleNew} style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
              <Plus size={13} strokeWidth={2.5} /> Nouveau CV
            </button>
            <button
              className="btn-ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              style={{ flex: 1, justifyContent: 'center', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
              title="Importer un PDF et laisser l'IA remplir les sections"
            >
              <Upload size={12} strokeWidth={2} /> Importer PDF
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => handleImport(e.target.files[0])} />
          </div>

          {/* Nom pour l'import */}
          <input
            className={styles.importNameInput}
            placeholder="Nom du CV importé (optionnel)"
            value={importName}
            onChange={e => setImportName(e.target.value)}
          />

          {/* Sélecteur moteur IA */}
          {!importing && (
            <div className={styles.aiProviderRow}>
              <span className={styles.aiProviderLabel}>Moteur IA :</span>
              <div className={styles.aiProviderBtns}>
                <button
                  className={`${styles.aiProviderBtn} ${aiProvider === 'auto' ? styles.aiProviderActive : ''}`}
                  onClick={() => setAiProvider('auto')}
                  title="Utilise OpenRouter si configuré, sinon Ollama"
                >
                  Auto
                </button>
                <button
                  className={`${styles.aiProviderBtn} ${aiProvider === 'ollama' ? styles.aiProviderActive : ''}`}
                  onClick={() => setAiProvider('ollama')}
                >
                  <Bot size={10} strokeWidth={2} /> Ollama
                </button>
                <button
                  className={`${styles.aiProviderBtn} ${aiProvider === 'openrouter' ? styles.aiProviderActiveOr : ''} ${!orConfigured ? styles.aiProviderDisabled : ''}`}
                  onClick={() => orConfigured && setAiProvider('openrouter')}
                  title={orConfigured ? 'Utiliser OpenRouter' : 'OpenRouter non configuré — allez dans Paramètres'}
                >
                  <Zap size={10} strokeWidth={2} /> OpenRouter
                </button>
              </div>
              {aiProvider === 'openrouter' && orConfigured && (
                <span className={styles.aiProviderHint}>Rapide · cloud</span>
              )}
              {aiProvider === 'ollama' && (
                <span className={styles.aiProviderHint}>Local · lent</span>
              )}
              {aiProvider === 'auto' && (
                <span className={styles.aiProviderHint}>{orConfigured ? 'OpenRouter détecté' : 'Ollama local'}</span>
              )}
            </div>
          )}

          {/* Message d'import en cours */}
          {importing && (
            <div className={styles.importingBox}>
              <div className={styles.importingTop}>
                <div className={styles.importingIcon}>
                  <Timer size={15} strokeWidth={1.5} style={{ color: 'var(--primary)' }} />
                </div>
                <div className={styles.importingText}>
                  <p className={styles.importingTitle}>Importation en cours…</p>
                  <p className={styles.importingDesc}>
                    {aiProvider === 'openrouter' || (aiProvider === 'auto' && orConfigured)
                      ? 'OpenRouter analyse le PDF'
                      : 'Ollama analyse le PDF'}
                  </p>
                </div>
                <div className={styles.importingElapsed}>
                  <span className={styles.elapsedNum}>{elapsed}</span>
                  <span className={styles.elapsedUnit}>s</span>
                </div>
              </div>
              <div className={styles.importingBar}>
                <div className={styles.importingBarFill} />
              </div>
              <p className={styles.importingNote}>
                Remplissage automatique de toutes les sections. Vérifiez ensuite le résultat.
              </p>
            </div>
          )}

          {importError && (
            <div className={styles.errorBox}>
              <AlertCircle size={12} strokeWidth={2} /> {importError}
            </div>
          )}

          {/* Liste des CVs */}
          <div className={styles.cvList}>
            {!cvList?.length ? (
              <div className={styles.emptyList}>
                <FileText size={28} style={{ color: 'var(--outline)', marginBottom: 8 }} strokeWidth={1.5} />
                <p>Aucun CV. Créez-en un ou importez un PDF.</p>
              </div>
            ) : (
              cvList.map(cv => {
                const isChecked = selected.has(cv.id)
                return (
                  <div
                    key={cv.id}
                    className={`${styles.cvItem}
                      ${selectedId === cv.id && !selectMode ? styles.cvItemActive : ''}
                      ${isChecked ? styles.cvItemChecked : ''}
                      ${selectMode ? styles.cvItemSelectMode : ''}`}
                    onClick={() => selectMode ? toggleSelect({ stopPropagation: () => {} }, cv.id) : setSelectedId(cv.id)}
                  >
                    {/* Checkbox en mode sélection */}
                    {selectMode && (
                      <button
                        className={`${styles.checkbox} ${isChecked ? styles.checkboxChecked : ''}`}
                        onClick={e => toggleSelect(e, cv.id)}
                        title={isChecked ? 'Désélectionner' : 'Sélectionner'}
                      >
                        {isChecked
                          ? <CheckSquare size={13} strokeWidth={2.5} />
                          : <Square size={13} strokeWidth={2} />}
                      </button>
                    )}

                    <div className={styles.cvItemContent}>
                      <div className={styles.cvItemName}>{cv.name}</div>
                      <div className={styles.cvItemMeta}>
                        {cv.full_name && <span>{cv.full_name}</span>}
                        <span>{new Date(cv.created_at).toLocaleDateString('fr-FR')}</span>
                        {cv.source_pdf && <span className={styles.pdfTag}>PDF</span>}
                      </div>
                    </div>

                    {/* Corbeille au survol (hors mode sélection) */}
                    {!selectMode && (
                      <button
                        className={styles.itemDeleteBtn}
                        onClick={e => handleDeleteOne(e, cv.id)}
                        title="Supprimer ce CV"
                      >
                        <Trash2 size={11} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Zone d'édition ── */}
        <div className={styles.editorZone}>
          {loadingCV && (
            <div className={styles.loadingCenter}>
              <Loader size={24} className={styles.spin} strokeWidth={1.5} style={{ color: 'var(--primary)' }} />
              <p style={{ color: 'var(--outline)', marginTop: 10, fontSize: 13 }}>Chargement du CV…</p>
            </div>
          )}
          {!loadingCV && !currentCV && (
            <div className={styles.emptyEditor}>
              <FileText size={40} strokeWidth={1} style={{ color: 'var(--outline)', marginBottom: 16 }} />
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 18, color: 'var(--on-surface)', marginBottom: 8 }}>
                Sélectionnez un CV
              </h2>
              <p style={{ fontSize: 13, color: 'var(--outline)', maxWidth: 340, textAlign: 'center', lineHeight: 1.5 }}>
                Choisissez un CV dans la liste ou créez-en un nouveau. Vous pouvez aussi importer un PDF — Ollama remplira automatiquement chaque section.
              </p>
            </div>
          )}
          {!loadingCV && currentCV && (
            <CVEditor cv={currentCV} onSaved={handleSaved} onDelete={handleDelete} />
          )}
        </div>
      </div>
    </div>
  )
}
