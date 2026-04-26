/**
 * src/api/dashboard.js
 * Appels API pour le tableau de bord.
 */
import { api } from './client.js'

/** GET /api/dashboard/overview */
export async function fetchOverview() {
  return api.get('/dashboard/overview')
}

/**
 * GET /api/dashboard/chart?type=velocity|scoring&days=7|30&offset=0,1,2…
 * Utilisé par les graphiques pour la navigation (semaine/mois précédent).
 */
export async function fetchChartData({ type = 'velocity', days = 7, offset = 0 } = {}) {
  return api.get(`/dashboard/chart?type=${type}&days=${days}&offset=${offset}`)
}
