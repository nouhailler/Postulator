/** src/api/cvStore.js */
import { api } from './client.js'

export const fetchCVList   = ()           => api.get('/cv-store')
export const fetchCVDetail = (id)         => api.get(`/cv-store/${id}`)
export const createCV      = (name)       => api.post('/cv-store', { name })
export const updateCV      = (id, data)   => {
  const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api'
  return fetch(`${BASE_URL}/cv-store/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(r => r.json())
}
export const deleteCV      = (id)         => api.delete(`/cv-store/${id}`)

/** Import PDF → parse Ollama */
export async function importPDF(file, name, model) {
  const form = new FormData()
  form.append('file', file)
  form.append('name', name)
  if (model) form.append('model', model)
  const BASE_URL = (import.meta.env.VITE_API_URL ?? '') + '/api'
  const res = await fetch(`${BASE_URL}/cv-store/import-pdf`, {
    method: 'POST', body: form,
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail ?? 'Erreur import') }
  return res.json()
}
