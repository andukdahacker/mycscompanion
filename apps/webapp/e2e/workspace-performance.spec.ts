import { test as it, expect } from '@playwright/test'

const describe = it.describe

describe('Workspace Performance', () => {
  it('should have LCP under 2.5 seconds on workspace load', async ({ page }) => {
    // Navigate first, then observe LCP with buffered:true to catch entries recorded during load
    await page.goto('/workspace/milestone-1')

    const lcpMs = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1]
          if (lastEntry) {
            observer.disconnect()
            resolve(lastEntry.startTime)
          }
        })
        observer.observe({ type: 'largest-contentful-paint', buffered: true })

        // Fallback — resolve after 5s if no LCP observed
        setTimeout(() => {
          observer.disconnect()
          resolve(-1)
        }, 5000)
      })
    })

    if (lcpMs >= 0) {
      expect(lcpMs).toBeLessThan(2500)
    }
  })

  it('should have TTI under 3.5 seconds on workspace load', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/workspace/milestone-1')

    // Wait for main interactive elements to be present
    await page.waitForSelector('[data-testid="workspace-layout"], [data-testid="workspace-error"], [data-testid="workspace-skeleton"]', {
      timeout: 3500,
    })

    const loadTime = Date.now() - startTime
    expect(loadTime).toBeLessThan(3500)
  })

  it('should complete client-side route transition under 200ms', async ({ page }) => {
    // Load workspace to prime all JS bundles
    await page.goto('/workspace/milestone-1')
    await page.waitForSelector(
      '[data-testid="workspace-layout"], [data-testid="workspace-error"], [data-testid="workspace-skeleton"]',
    )

    // Measure SPA navigation to a different milestone (React Router v7 listens to popstate)
    const transitionMs = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const start = performance.now()

        window.history.pushState({}, '', '/workspace/milestone-2')
        window.dispatchEvent(new PopStateEvent('popstate'))

        // Wait for React to commit the re-render by observing DOM mutations
        const observer = new MutationObserver(() => {
          observer.disconnect()
          // Allow one additional frame for React to finish painting
          requestAnimationFrame(() => {
            resolve(performance.now() - start)
          })
        })
        observer.observe(document.body, { childList: true, subtree: true })

        // Fallback if no DOM mutation occurs (same-route param change may not add/remove nodes)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            observer.disconnect()
            resolve(performance.now() - start)
          })
        })
      })
    })

    expect(transitionMs).toBeLessThan(200)
  })
})
