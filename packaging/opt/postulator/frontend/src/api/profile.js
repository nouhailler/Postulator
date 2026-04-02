/**
 * src/api/profile.js
 */
import { api } from './client.js'

export async function fetchProfile() {
  return api.get('/profile')
}

export async function saveProfile(payload) {
  return api.post('/profile', payload)  // PUT mais on réutilise post avec method override
}

export async function putProfile(payload) {
  return api.patch('/profile', payload)
}

// PUT explicite
export async function updateProfile(payload) {
  const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api'
  const res = await fetch(`${BASE_URL}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** POST /api/profile/generate-cv — génère un CV adapté via Ollama (timeout 5min) */
export async function generateCV(jobId, model, language = 'fr') {
  return api.postAI('/profile/generate-cv', { job_id: jobId, model: model ?? null, language })
}
