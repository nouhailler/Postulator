/**
 * src/contexts/OllamaStatusContext.jsx
 * Contexte global pour signaler qu'Ollama est en train de traiter.
 *
 * Usage dans une page :
 *   const { setOllamaStatus, clearOllamaStatus } = useOllamaStatus()
 *   setOllamaStatus('Offres Intelligence')   // avant l'appel
 *   clearOllamaStatus()                       // dans finally
 */
import { createContext, useCallback, useContext, useState } from 'react'

const OllamaStatusContext = createContext(null)

export function OllamaStatusProvider({ children }) {
  // { label: string, startedAt: Date } | null
  const [status, setStatusState] = useState(null)

  const setOllamaStatus = useCallback((label) => {
    setStatusState({ label, startedAt: new Date() })
  }, [])

  const clearOllamaStatus = useCallback(() => {
    setStatusState(null)
  }, [])

  return (
    <OllamaStatusContext.Provider value={{ status, setOllamaStatus, clearOllamaStatus }}>
      {children}
    </OllamaStatusContext.Provider>
  )
}

export function useOllamaStatus() {
  const ctx = useContext(OllamaStatusContext)
  if (!ctx) throw new Error('useOllamaStatus must be used inside OllamaStatusProvider')
  return ctx
}
