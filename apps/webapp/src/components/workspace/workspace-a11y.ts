/** Inject text into the workspace ARIA live region */
function announceToScreenReader(message: string): void {
  const el = document.getElementById('workspace-announcer')
  if (el) {
    el.textContent = ''
    // requestAnimationFrame ensures screen readers detect the change
    requestAnimationFrame(() => { el.textContent = message })
  }
}

export { announceToScreenReader }
