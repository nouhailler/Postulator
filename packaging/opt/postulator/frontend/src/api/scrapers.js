/**
 * src/api/scrapers.js
 */
import { api } from './client.js'

export const fetchSources    = ()         => api.get('/scrapers/sources')
export const fetchTaskStatus = (taskId)   => api.get(`/scrapers/status/${taskId}`)

export function fetchScrapeLogs({ source, limit = 50 } = {}) {
  const qs = new URLSearchParams(
    Object.entries({ source, limit }).filter(([, v]) => v != null)
  ).toString()
  return api.get(`/scrapers/logs${qs ? '?' + qs : ''}`)
}

export const fetchScrapeLogDetail = (id) => api.get(`/scrapers/logs/${id}`)

/** POST /api/scrapers/run — scraping standard */
export function runScraper(payload) {
  return api.post('/scrapers/run', payload)
}

/** POST /api/scrapers/run-with-proxies — scraping avec proxies résidentiels */
export function runScraperWithProxies(payload) {
  // payload = { ...ScrapeRequest, proxies: string[] }
  return api.post('/scrapers/run-with-proxies', payload)
}
