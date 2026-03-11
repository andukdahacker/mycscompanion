import { test, expect } from '@playwright/test'

// TODO(7-2): Enable when Go benchmark harness is deployed
// This test validates that a benchmark submission round-trip
// (button click → SSE benchmark_result event received) completes
// in <10 seconds for a standard workload.
test.describe('Benchmark round-trip performance', () => {
  test.skip(true, 'Go execution image does not yet support --benchmark flag')

  test('should complete benchmark round-trip in under 10 seconds', async ({ page }) => {
    // Navigate to workspace with a milestone that has benchmark config
    await page.goto('/workspace/milestone-1')

    // Wait for workspace to load
    await page.waitForSelector('[data-testid="code-editor"]')

    const iterations = 3
    const timings: number[] = []

    for (let i = 0; i < iterations; i++) {
      const start = Date.now()

      // Click the Benchmark button (Cmd+Shift+Enter)
      await page.keyboard.press('Control+Shift+Enter')

      // Wait for benchmark_result to appear in the output
      await page.waitForSelector('[data-testid="benchmark-hero-display"]', {
        timeout: 15_000,
      })

      const elapsed = Date.now() - start
      timings.push(elapsed)
    }

    // Assert: all runs should complete in <10 seconds
    for (const timing of timings) {
      expect(timing).toBeLessThan(10_000)
    }

    // Assert: failure threshold — no more than 10% of runs exceed 15s
    const exceeding15s = timings.filter((t) => t > 15_000).length
    expect(exceeding15s / timings.length).toBeLessThanOrEqual(0.1)
  })
})
