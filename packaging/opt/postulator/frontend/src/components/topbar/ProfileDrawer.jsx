import { useEffect } from 'react'
import { X, User, Briefcase, GraduationCap, Code2, Globe, FileText, ChevronRight } from 'lucide-react'
import { useProfile } from '../../hooks/useProfile.js'
import { useNavigate } from 'react-router-dom'
import styles from './Drawer.module.css'
import pStyles from './ProfileDrawer.module.css'

function PreviewRow({ label, value }) {
  if (!value) return null
  return (
    <div className={pStyles.previewRow}>
      <span className={pStyles.previewLabel}>{label}</span>
      <span className={pStyles.previewValue}>{value}</span>
    </div>
  )
}

function PreviewSection({ icon: Icon, title, content, color }) {
  if (!content) return null
  return (
    <div className={pStyles.previewSection}>
      <p className={pStyles.previewSectionTitle} style={{ color: color ?? 'var(--primary)' }}>
        <Icon size={12} strokeWidth={2} /> {title}
      </p>
      <p className={pStyles.previewSectionContent}>{content.slice(0, 300)}{content.length > 300 ? '…' : ''}</p>
    </div>
  )
}

export default function ProfileDrawer({ open, onClose }) {
  const { profile, initials } = useProfile()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const goToCV = () => { onClose(); navigate('/cv') }
  const goToMatching = () => { onClose(); navigate('/cv-matching') }

  const hasProfile = profile?.full_name || profile?.summary

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerRight}`}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={pStyles.avatarMed}>{initials}</div>
            <div>
              <h2 className={styles.title}>{profile?.full_name || 'Mon Profil'}</h2>
              <p className={styles.subtitle}>{profile?.title || 'Configurer dans CV →'}</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} strokeWidth={2} /></button>
        </div>

        {/* CTA vers les pages dédiées */}
        <div className={pStyles.ctaBlock}>
          <button className={`btn-primary ${pStyles.ctaBtn}`} onClick={goToCV}>
            <FileText size={13} strokeWidth={2} />
            Gérer mes CVs
            <ChevronRight size={13} strokeWidth={2} style={{ marginLeft: 'auto' }} />
          </button>
          <button className={`btn-ghost ${pStyles.ctaBtn}`} onClick={goToMatching}>
            <Code2 size={13} strokeWidth={2} />
            CV Matching — Générer un CV adapté
            <ChevronRight size={13} strokeWidth={2} style={{ marginLeft: 'auto' }} />
          </button>
        </div>

        {/* Preview du profil */}
        {!hasProfile ? (
          <div className={styles.section}>
            <p className={styles.empty}>
              Aucun profil configuré. Cliquez sur "Gérer mes CVs" pour créer ou importer votre CV.
            </p>
          </div>
        ) : (
          <>
            {/* Identité */}
            <section className={styles.section}>
              <p className={styles.sectionLabel}>Identité</p>
              <PreviewRow label="Email"    value={profile?.email} />
              <PreviewRow label="Tél"      value={profile?.phone} />
              <PreviewRow label="Lieu"     value={profile?.location} />
              <PreviewRow label="LinkedIn" value={profile?.linkedin_url} />
              <PreviewRow label="GitHub"   value={profile?.github_url} />
            </section>

            {/* Sections preview */}
            <section className={styles.section}>
              <p className={styles.sectionLabel}>Aperçu du profil</p>
              <PreviewSection icon={FileText}       title="Résumé"       content={profile?.summary}        color="var(--tertiary)" />
              <PreviewSection icon={Briefcase}      title="Expériences"  content={profile?.experiences}    color="var(--primary)" />
              <PreviewSection icon={Code2}          title="Compétences"  content={profile?.skills}         color="var(--primary)" />
              <PreviewSection icon={GraduationCap}  title="Formation"    content={profile?.education}      color="var(--outline)" />
              <PreviewSection icon={Globe}          title="Langues"      content={profile?.languages}      color="var(--outline)" />
            </section>

            <div className={styles.section}>
              <p className={pStyles.previewNote}>
                Pour modifier ces informations, utilisez la page <strong>CV</strong> dans le menu de navigation.
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
