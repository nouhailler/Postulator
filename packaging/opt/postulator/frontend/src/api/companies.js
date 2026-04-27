/** src/api/companies.js */
import { api } from './client.js'

export const fetchCompanies       = ()         => api.get('/companies')
export const createCompany        = (payload)  => api.post('/companies', payload)
export const updateCompany        = (id, data) => api.patch(`/companies/${id}`, data)
export const deleteCompany        = (id)       => api.delete(`/companies/${id}`)
export const discoverCompanyUrl   = (id)       => api.post(`/companies/${id}/discover`, {})
export const scrapeCompany        = (id)       => api.post(`/companies/${id}/scrape`, {})
export const cancelCompanyRun     = (id)       => api.post(`/companies/${id}/cancel`, {})
export const scrapeAllCompanies   = ()         => api.post('/companies/scrape-all', {})
export const fetchRunStatus       = ()         => api.get('/companies/run-status')
export const fetchCompaniesConfig = ()         => api.get('/companies/config')
export const saveCompaniesConfig  = (cfg)      => api.post('/companies/config', cfg)
export const ddgSearch            = (company_name, keyword) =>
  api.post('/companies/ddg-search', { company_name, keyword })
