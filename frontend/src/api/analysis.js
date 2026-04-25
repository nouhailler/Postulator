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

/** POST /api/analysis/score-openrouter — score via OpenRouter avec modèle au choix */
export async function scoreJobOpenRouter(cvId, jobId, orModel) {
  return api.postAI('/analysis/score-openrouter', {
    cv_id:    cvId,
    job_id:   jobId,
    or_model: orModel,
  })
}

/** POST /api/analysis/summarize-jobs — résumé IA des N dernières offres (max 10) */
export async function summarizeJobs(limit = 10) {
  return api.post('/analysis/summarize-jobs', { limit })
}

/** GET /api/analysis/summarize-jobs/status — état du batch résumé */
export async function getSummarizeStatus() {
  return api.get('/analysis/summarize-jobs/status')
}

/**
 * POST /api/analysis/score-batch — score en masse
 * @param {number} cvId
 * @param {number} limit — nombre d'offres à scorer
 * @param {string} statusFilter — filtre statut ('new' par défaut)
 */
export async function scoreBatch(cvId, limit = 20, statusFilter = 'new') {
  return api.postAI('/analysis/score-batch', {
    cv_id: cvId,
    limit,
    status_filter: statusFilter,
  })
}

/** GET /api/analysis/score-batch/status — état + résultats du dernier batch */
export async function getScoreBatchStatus() {
  return api.get('/analysis/score-batch/status')
}

export async function pingOllama() {
  return api.get('/analysis/ollama/ping')
}

export async function fetchOllamaModels() {
  return api.get('/analysis/ollama/models')
}
