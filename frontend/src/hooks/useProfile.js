/**
 * src/hooks/useProfile.js
 * Gère le chargement et la sauvegarde du profil utilisateur.
 */
import { useCallback, useEffect, useState } from 'react'
import { fetchProfile, updateProfile } from '../api/profile.js'

export function useProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    fetchProfile()
      .then(setProfile)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const save = useCallback(async (data) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateProfile(data)
      setProfile(updated)
      return updated
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }, [])

  // Calcule les initiales depuis le nom
  const initials = profile?.initials
    || profile?.full_name?.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
    || 'SA'

  return { profile, loading, saving, error, save, initials }
}
