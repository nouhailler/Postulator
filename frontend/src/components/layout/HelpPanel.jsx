import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { HelpCircle, X, ChevronDown, ChevronUp } from 'lucide-react'
import { HELP_CONTENT, DEFAULT_HELP } from '../../data/helpContent.js'
import styles from './HelpPanel.module.css'

// ── Section accordéon d'aide ──────────────────────────────────────────────────
function HelpSection({ section, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(o => !o)}>
        <span className={styles.sectionIcon}>{section.icon}</span>
        <span className={styles.sectionTitle}>{section.title}</span>
        {open
          ? <ChevronUp  size={13} strokeWidth={2} className={styles.chevron} />
          : <ChevronDown size={13} strokeWidth={2} className={styles.chevron} />
        }
      </button>
      {open && (
        <div className={styles.sectionBody}>
          {section.content}
        </div>
      )}
    </div>
  )
}

// ── Panneau principal ─────────────────────────────────────────────────────────
function HelpDrawer({ onClose }) {
  const { pathname } = useLocation()
  const drawerRef = useRef()

  // Trouver le contenu selon la route exacte ou le préfixe
  const help = Object.entries(HELP_CONTENT).find(([route]) =>
    pathname === route || pathname.startsWith(route + '/')
  )?.[1] ?? DEFAULT_HELP

  // Fermer avec Escape
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Fermer en cliquant hors du panneau
  useEffect(() => {
    const h = e => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) onClose()
    }
    // Délai pour éviter que le clic d'ouverture ferme immédiatement
    const id = setTimeout(() => document.addEventListener('mousedown', h), 100)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', h) }
  }, [onClose])

  return (
    <div ref={drawerRef} className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.helpIcon}>?</span>
          <div>
            <h3 className={styles.title}>{help.title}</h3>
            <p className={styles.badge}>Aide contextuelle</p>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Intro */}
      <div className={styles.intro}>
        {help.intro}
      </div>

      {/* Sections */}
      <div className={styles.sections}>
        {help.sections.map((section, i) => (
          <HelpSection
            key={i}
            section={section}
            defaultOpen={i === 0}
          />
        ))}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <p className={styles.footerText}>
          Postulator v0.1.0 · Open Source · IA 100% locale via Ollama
        </p>
        <p className={styles.footerHint}>
          Appuyez sur <kbd className={styles.kbd}>?</kbd> ou cliquez sur le bouton
          bleu pour ouvrir cette aide depuis n'importe quelle page.
        </p>
      </div>
    </div>
  )
}

// ── Bouton flottant + panneau ─────────────────────────────────────────────────
export default function HelpPanel() {
  const [open, setOpen]           = useState(false)
  const { pathname }              = useLocation()
  const [prevPath, setPrevPath]   = useState(pathname)

  // Fermer automatiquement quand on change de page
  useEffect(() => {
    if (pathname !== prevPath) {
      setOpen(false)
      setPrevPath(pathname)
    }
  }, [pathname, prevPath])

  // Raccourci clavier global : touche "?"
  useEffect(() => {
    const h = e => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <>
      {/* Bouton flottant */}
      <button
        className={`${styles.fab} ${open ? styles.fabActive : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Aide contextuelle"
        title="Aide — ou appuyez sur ?"
      >
        {open ? <X size={18} strokeWidth={2.5} /> : <HelpCircle size={18} strokeWidth={2} />}
      </button>

      {/* Panneau d'aide */}
      {open && <HelpDrawer onClose={() => setOpen(false)} />}
    </>
  )
}
