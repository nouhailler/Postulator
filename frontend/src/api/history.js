/**
 * src/api/history.js
 */
import { api } from './client.js'

/** GET /api/history */
export async function fetchHistory({ cvId, jobId, minScore, maxScore, dateFrom, dateTo, limit = 200 } = {}) {
  const params = {}
  if (cvId     != null) params.cv_id     = cvId
  if (jobId    != null) params.job_id    = jobId
  if (minScore != null) params.min_score = minScore
  if (maxScore != null) params.max_score = maxScore
  if (dateFrom != null) params.date_from = dateFrom
  if (dateTo   != null) params.date_to   = dateTo
  params.limit = limit
  const qs = new URLSearchParams(params).toString()
  return api.get(`/history${qs ? '?' + qs : ''}`)
}

/** POST /api/history — sauvegarde un résultat */
export async function saveMatch(payload) {
  return api.post('/history', payload)
}

/** GET /api/history/:id */
export async function fetchMatch(id) {
  return api.get(`/history/${id}`)
}

/** DELETE /api/history/:id */
export async function deleteMatch(id) {
  return api.delete(`/history/${id}`)
}
