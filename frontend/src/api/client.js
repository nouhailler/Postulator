/**
 * src/api/client.js
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api'

const TIMEOUT_DEFAULT = 30_000    // 30s
const TIMEOUT_AI      = 600_000   // 10 min — Ollama sur CPU peut être très lent

export class ApiError extends Error {
  constructor(status, message, detail) {
    super(message)
    this.name   = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function request(path, options = {}) {
  const url        = `${BASE_URL}${path}`
  const timeout    = options.timeout ?? TIMEOUT_DEFAULT
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), timeout)

  const isFormData = options.body instanceof FormData
  const headers = isFormData
    ? { ...options.headers }
    : { 'Content-Type': 'application/json', ...options.headers }

  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      ...options,
      timeout: undefined,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      let detail = ''
      try {
        const body = await res.json()
        detail = body.detail ?? JSON.stringify(body)
      } catch {
        detail = res.statusText
      }
      throw new ApiError(res.status, `HTTP ${res.status}`, detail)
    }

    if (res.status === 204) return null
    return res.json()

  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new ApiError(0, 'Timeout', `La requête a dépassé ${Math.round(timeout / 60000)} min. Ollama est peut-être surchargé.`)
    }
    throw err
  }
}

export const api = {
  get:         (path, opts)       => request(path, { method: 'GET', ...opts }),
  post:        (path, body, opts) => request(path, { method: 'POST', body: JSON.stringify(body), ...opts }),
  postEmpty:   (path, opts)       => request(path, { method: 'POST', ...opts }),
  patch:       (path, body, opts) => request(path, { method: 'PATCH', body: JSON.stringify(body), ...opts }),
  delete:      (path, opts)       => request(path, { method: 'DELETE', ...opts }),
  upload:      (path, formData)   => request(path, { method: 'POST', body: formData }),

  // Appels IA — timeout 10 min
  postAI:      (path, body, opts) => request(path, { method: 'POST', body: JSON.stringify(body), timeout: TIMEOUT_AI, ...opts }),
  postEmptyAI: (path, opts)       => request(path, { method: 'POST', timeout: TIMEOUT_AI, ...opts }),
}
