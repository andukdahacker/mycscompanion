import { useEffect, useRef, useCallback } from 'react'

/** Auto-scroll a container to bottom on new content.
 *  Pauses when user scrolls up, resumes when scrolled back to bottom. */
function useAutoScroll<T>(deps: ReadonlyArray<T>): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const shouldAutoScroll = useRef(true)
  const rafId = useRef<number>(0)

  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      const el = containerRef.current
      if (!el) return
      shouldAutoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(rafId.current)
    }
  }, [handleScroll])

  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, deps) // deps is intentionally dynamic (caller controls re-run)

  return containerRef
}

export { useAutoScroll }
