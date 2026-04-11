/** src/api/automation.js */
import { api } from './client.js'

/** GET /api/automation/config — config actuelle */
export const fetchAutomationConfig = () => api.get('/automation/config')

/** POST /api/automation/config — sauvegarder et activer */
export const saveAutomationConfig = (payload) => api.post('/automation/config', payload)

/** DELETE /api/automation/config — désactiver */
export const deleteAutomationConfig = () => api.delete('/automation/config')

/** GET /api/automation/status — état du run courant ou dernier run */
export const fetchAutomationStatus = () => api.get('/automation/status')

/** POST /api/automation/run-now — déclencher manuellement */
export const runAutomationNow = () => api.post('/automation/run-now', {})

/** POST /api/automation/cancel — annuler le run en cours */
export const cancelAutomation = () => api.post('/automation/cancel', {})
