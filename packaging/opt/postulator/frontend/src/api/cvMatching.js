/** src/api/cvMatching.js */
import { api } from './client.js'

export const fetchGenerated    = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null)).toString()
  return api.get(`/cv-matching${qs ? '?' + qs : ''}`)
}
export const fetchGeneratedOne = (id)           => api.get(`/cv-matching/${id}`)
export const deleteGenerated   = (id)           => api.delete(`/cv-matching/${id}`)
export const updateNotes       = (id, notes)    => api.patch(`/cv-matching/${id}/notes`, { notes })

/** POST /api/cv-matching/generate — timeout 5min */
export function generateMatchingCV(sourceCvId, jobId, language = 'fr', model = null) {
  return api.postAI('/cv-matching/generate', {
    source_cv_id: sourceCvId,
    job_id:       jobId,
    language,
    model,
  })
}

/**
 * Export DOCX via pandoc côté backend.
 * Retourne true si réussi, false si pandoc absent (fallback .md).
 */
export async function exportDocx(genId, filename) {
  const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api'
  const url = `${BASE_URL}/cv-matching/${genId}/export/docx`

  try {
    const res = await fetch(url)
    if (res.status === 503) {
      // pandoc absent → informer le frontend pour fallback
      const body = await res.json()
      return { ok: false, message: body.detail }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail ?? `HTTP ${res.status}`)
    }
    // Télécharger le blob
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
