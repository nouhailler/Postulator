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

/** GET /api/jobs/:id  — retourne JobRead complet avec description */
export async function fetchJob(id) {
  return api.get(`/jobs/${id}`)
}

export async function updateJobStatus(id, status) {
  return api.patch(`/jobs/${id}/status`, { status })
}

export async function deleteJob(id) {
  return api.delete(`/jobs/${id}`)
}
