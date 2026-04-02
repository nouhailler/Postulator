/** src/api/alerts.js */
import { api } from './client.js'

export const fetchAlertStatus = ()       => api.get('/alerts/status')
export const testSmtp          = ()       => api.post('/alerts/test', {})
export const sendMatchAlert    = (matchId) => api.post(`/alerts/send/${matchId}`, {})
