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
 * POST /api/cvs/import-from-store/{id}
 * Importe un StoredCV (menu CV) dans la table cvs (CV Intelligence)
 * sans re-télécharger de fichier.
 */
export async function importCVFromStore(storeId) {
  return api.post(`/cvs/import-from-store/${storeId}`, {})
}

/**
 * POST /api/cvs/{id}/analyze
 * Lance l'extraction de compétences Ollama.
 */
export async function analyzeCV(id, model) {
  const qs = model ? `?model=${encodeURIComponent(model)}` : ''
  return api.postEmptyAI(`/cvs/${id}/analyze${qs}`)
}
