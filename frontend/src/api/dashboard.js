/**
 * src/api/dashboard.js
 * Appels API pour le tableau de bord.
 */
import { api } from './client.js'

/** GET /api/dashboard/overview
 *  Retourne : { kpi, velocity_7d, source_stats, recent_logs }
 */
export async function fetchOverview() {
  return api.get('/dashboard/overview')
}
