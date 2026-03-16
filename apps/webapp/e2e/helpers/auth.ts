import type { Browser, BrowserContext } from '@playwright/test'

export const TEST_USER = {
  uid: 'test-user-canary',
  email: 'canary@test.mycscompanion.com',
  displayName: 'E2E Canary User',
} as const

/**
 * Creates an authenticated browser context with Firebase Auth test token.
 * Scaffold — actual token injection implemented in Story 2.1 when auth is wired.
 *
 * Usage:
 *   const context = await createAuthenticatedContext(browser)
 *   const page = await context.newPage()
 */
export async function createAuthenticatedContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext()
  // TODO(story-2.1): Set Firebase Auth token in localStorage/cookie
  // await context.addCookies([{ name: 'auth-token', value: '<test-token>', domain: 'localhost', path: '/' }])
  return context
}
