/**
 * src/api/jobsIntelligence.js
 * Appels API pour la page Offres Intelligence.
 */
import { api } from './client.js'

/**
 * Charge l'historique des Q&A pour une offre donnée.
 * @param {number} jobId
 * @returns {Promise<Array<{id, question, answer, model, desc_source, duration_ms, asked_at}>>}
 */
export function fetchJobQuestions(jobId) {
  return api.get(`/jobs-intelligence/questions/${jobId}`)
}
