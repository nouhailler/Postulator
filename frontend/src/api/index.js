/**
 * src/api/index.js
 * Point d'entrée unique pour tous les modules API.
 */
export * as dashboardApi from './dashboard.js'
export * as jobsApi      from './jobs.js'
export * as scrapersApi  from './scrapers.js'
export * as cvsApi       from './cvs.js'
export * as analysisApi  from './analysis.js'
export { api, ApiError } from './client.js'
