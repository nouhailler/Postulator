/**
 * src/api/analysis.js
 */
import { api } from './client.js'

/** POST /api/analysis/score — async Celery */
export async function scoreJobAsync(cvId, jobId, model) {
  return api.post('/analysis/score', { cv_id: cvId, job_id: jobId, model: model ?? null })
}

/** POST /api/analysis/score-sync — synchrone, attend la réponse Ollama (timeout 2min) */
export async function scoreJobSync(cvId, jobId, model) {
  return api.postAI('/analysis/score-sync', {
    cv_id: cvId,
    job_id: jobId,
    model: model ?? null,
  })
}

export async function pingOllama() {
  return api.get('/analysis/ollama/ping')
}

export async function fetchOllamaModels() {
  return api.get('/analysis/ollama/models')
}
