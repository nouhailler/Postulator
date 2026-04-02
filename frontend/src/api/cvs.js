/**
 * src/api/cvs.js
 */
import { api } from './client.js'

export async function fetchCVs() {
  return api.get('/cvs')
}

export async function fetchCV(id) {
  return api.get(`/cvs/${id}`)
}

export async function uploadCV(file, name) {
  const form = new FormData()
  form.append('file', file)
  form.append('name', name)
  return api.upload('/cvs/upload', form)
}

export async function updateCV(id, payload) {
  return api.patch(`/cvs/${id}`, payload)
}

export async function deleteCV(id) {
  return api.delete(`/cvs/${id}`)
}

/**
 * POST /api/cvs/{id}/analyze
 * Lance l'extraction de compétences Ollama.
 * - Pas de body JSON (la route FastAPI n'en attend pas)
 * - Timeout 2 min (inférence Ollama peut être longue)
 */
export async function analyzeCV(id, model) {
  const qs = model ? `?model=${encodeURIComponent(model)}` : ''
  return api.postEmptyAI(`/cvs/${id}/analyze${qs}`)
}
