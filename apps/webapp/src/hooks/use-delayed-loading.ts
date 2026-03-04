import { useEffect, useState } from 'react'

function useDelayedLoading(isLoading: boolean, delayMs = 500): boolean {
  const [showLoading, setShowLoading] = useState(false)
  useEffect(() => {
    if (!isLoading) { setShowLoading(false); return }
    const timer = setTimeout(() => setShowLoading(true), delayMs)
    return () => clearTimeout(timer)
  }, [isLoading, delayMs])
  return showLoading
}

export { useDelayedLoading }
