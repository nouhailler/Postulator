/** src/api/cvMatching.js */
import { api } from './client.js'

export const fetchGenerated    = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null)).toString()
  return api.get(`/cv-matching${qs ? '?' + qs : ''}`)
}
export const fetchGeneratedOne = (id)           => api.get(`/cv-matching/${id}`)
export const deleteGenerated   = (id)           => api.delete(`/cv-matching/${id}`)
export const updateNotes       = (id, notes)    => api.patch(`/cv-matching/${id}/notes`, { notes })

/** POST /api/cv-matching/generate — adapte le CV à l'offre, sauvegarde en historique */
export function generateMatchingCV(sourceCvId, jobId, language = 'fr', model = null, signal = null) {
  return api.postAI('/cv-matching/generate', {
    source_cv_id: sourceCvId,
    job_id:       jobId,
    language,
    model,
  }, { signal })
}

/** POST /api/cv-matching/generate-ats — génère CV ATS + score + keywords (NON sauvegardé) */
export function generateATSCV(sourceCvId, jobId, language = 'fr', model = null, signal = null) {
  return api.postAI('/cv-matching/generate-ats', {
    source_cv_id: sourceCvId,
    job_id:       jobId,
    language,
    model,
  }, { signal })
}

/** POST /api/cv-matching/generate-ats-cloud — génère CV ATS via OpenRouter / Claude / OpenAI (NON sauvegardé) */
export function generateATSCloudCV(sourceCvId, jobId, language = 'fr', signal = null) {
  return api.postAI('/cv-matching/generate-ats-cloud', {
    source_cv_id: sourceCvId,
    job_id:       jobId,
    language,
  }, { signal })
}

/** GET /api/cv-matching/cloud-status — vérifie si un provider Cloud est configuré */
export function fetchCloudStatus() {
  return api.get('/cv-matching/cloud-status')
}

/**
 * POST /api/cv-matching/save-ats
 * Sauvegarde en base un résultat ATS déjà calculé (aucun appel Ollama supplémentaire).
 * @param {Object} params
 * @param {number} params.sourceCvId
 * @param {number} params.jobId
 * @param {string} params.language
 * @param {string} params.cvMarkdown
 * @param {string|null} params.sourceCvText
 * @param {Object} params.atsScore   — { score_keywords, score_experience, score_skills, score_education, score_format, total, label }
 * @param {Array}  params.keywordGaps
 * @param {Array}  params.suggestions
 */
export function saveATSCV({ sourceCvId, jobId, language, cvMarkdown, sourceCvText, atsScore, keywordGaps, suggestions }) {
  return api.post('/cv-matching/save-ats', {
    source_cv_id:    sourceCvId,
    job_id:          jobId,
    language,
    cv_markdown:     cvMarkdown,
    source_cv_text:  sourceCvText ?? null,
    ats_score:       atsScore,
    keyword_gaps:    keywordGaps,
    suggestions,
  })
}

/**
 * Export DOCX via pandoc côté backend.
 * Retourne { ok: true } si réussi, { ok: false, message } si pandoc absent (fallback .md).
 */
export async function exportDocx(genId, filename) {
  const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api'
  const url = `${BASE_URL}/cv-matching/${genId}/export/docx`

  try {
    const res = await fetch(url)
    if (res.status === 503) {
      const body = await res.json()
      return { ok: false, message: body.detail }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? `HTTP ${res.status}`)
    }
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename || `cv_${genId}.docx`
    a.click()
    URL.revokeObjectURL(objUrl)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}
