import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { apiFetch } from '../lib/api-fetch'
import { signOut } from '../lib/firebase'

type DeletionState = {
  readonly status: 'idle' | 'deleting' | 'failed'
  readonly error: string | null
}

function useAccountDeletion() {
  const navigate = useNavigate()
  const [state, setState] = useState<DeletionState>({ status: 'idle', error: null })

  const deleteAccount = useCallback(async () => {
    if (state.status === 'deleting') return
    setState({ status: 'deleting', error: null })
    try {
      await apiFetch<{ message: string }>('/api/account/delete', { method: 'DELETE' })
      try {
        await signOut()
      } catch {
        // Sign-out failure is non-critical — account is already deleted
      }
      navigate('/sign-in', { replace: true })
    } catch {
      setState({ status: 'failed', error: 'Account deletion failed. Please try again.' })
    }
  }, [navigate, state.status])

  const reset = useCallback(() => {
    setState({ status: 'idle', error: null })
  }, [])

  return { state, deleteAccount, reset }
}

export { useAccountDeletion }
