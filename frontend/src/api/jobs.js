/**
 * src/api/jobs.js
 */
import { api } from './client.js'

export async function fetchJobs(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString()
  return api.get(`/jobs${qs ? '?' + qs : ''}`)
}

export async function fetchTopMatches({ limit = 6, minScore = 80 } = {}) {
  return api.get(`/jobs/top-matches?limit=${limit}&min_score=${minScore}`)
}

export async function fetchJob(id) {
  return api.get(`/jobs/${id}`)
}

export async function updateJobStatus(id, status) {
  return api.patch(`/jobs/${id}/status`, { status })
}

export async function deleteJob(id) {
  return api.delete(`/jobs/${id}`)
}

/**
 * DELETE /api/jobs — purge la base d'offres.
 * @param {number} keepRecent  - nb d'offres récentes à garder (défaut 20)
 * @param {boolean} keepSelected - garder les offres avec statut != 'new' (défaut true)
 */
export async function purgeJobs({ keepRecent = 20, keepSelected = true } = {}) {
  const qs = new URLSearchParams({
    keep_recent:    keepRecent,
    keep_selected:  keepSelected,
  }).toString()
  // DELETE avec params dans l'URL
  const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api'
  const res = await fetch(`${BASE_URL}/jobs?${qs}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * DELETE /api/jobs/by-criteria — suppression en masse par critères.
 * @param {object} params
 *   maxScore     {number|null}  - score IA maximum (supprimer les offres EN DESSOUS de ce seuil)
 *   beforeDate   {string|null}  - date YYYY-MM-DD (supprimer les offres AVANT cette date)
 *   source       {string|null}  - source spécifique
 *   keepSelected {boolean}      - protéger les offres non-'new' (défaut true)
 *   dryRun       {boolean}      - simulation sans suppression (défaut false)
 */
export async function purgeJobsByCriteria({
  maxScore = null, minScore = null,
  beforeDate = null, afterDate = null,
  source = null, status = null,
  noScore = null,
  keepSelected = true, dryRun = false,
} = {}) {
  const params = { keep_selected: keepSelected, dry_run: dryRun }
  if (maxScore   != null) params.max_score   = maxScore
  if (minScore   != null) params.min_score   = minScore
  if (beforeDate != null) params.before_date = beforeDate
  if (afterDate  != null) params.after_date  = afterDate
  if (source)             params.source      = source
  if (status)             params.status      = status
  if (noScore)            params.no_score    = true

  const qs = new URLSearchParams(params).toString()
  const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api'
  const res = await fetch(`${BASE_URL}/jobs/by-criteria?${qs}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}
