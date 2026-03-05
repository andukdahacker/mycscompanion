import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@mycscompanion/config/test-utils/query-client'
import type { QueryClient } from '@tanstack/react-query'
import type { MilestoneCompletionData } from '@mycscompanion/shared'

const mockApiFetch = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../lib/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const MOCK_COMPLETION: MilestoneCompletionData = {
  milestoneId: 'ms-1',
  milestoneName: 'Simple Key-Value Store',
  milestoneNumber: 1,
  completedAt: '2026-03-05T10:00:00.000Z',
  criteriaResults: [
    { name: 'put-and-get', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
    { name: 'delete-key', order: 2, status: 'met', expected: 'PASS', actual: 'PASS' },
  ],
  nextMilestone: {
    id: 'ms-2',
    title: 'Storage Engine',
    position: 2,
    briefExcerpt: 'Build a storage engine that persists data to disk.',
  },
}

const LAST_MILESTONE_COMPLETION: MilestoneCompletionData = {
  milestoneId: 'ms-last',
  milestoneName: 'Final Milestone',
  milestoneNumber: 10,
  completedAt: '2026-03-05T10:00:00.000Z',
  criteriaResults: [
    { name: 'final-test', order: 1, status: 'met', expected: 'PASS', actual: 'PASS' },
  ],
  nextMilestone: null,
}

describe('Completion', () => {
  let queryClient: QueryClient
  let Completion: React.ComponentType

  function renderCompletion(milestoneId: string = 'ms-1') {
    return render(
      <MemoryRouter initialEntries={[`/completion/${milestoneId}`]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/completion/:milestoneId" element={<Completion />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    )
  }

  beforeEach(async () => {
    queryClient = createTestQueryClient()
    mockApiFetch.mockReset()
    mockNavigate.mockReset()
    mockApiFetch.mockResolvedValue(MOCK_COMPLETION)
    const mod = await import('./Completion')
    Completion = mod.default
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('should render completion data with criteria summary', async () => {
    renderCompletion()

    expect(await screen.findByText(/Milestone 1: Simple Key-Value Store — Complete/)).toBeDefined()
    expect(screen.getByText('put-and-get')).toBeDefined()
    expect(screen.getByText('delete-key')).toBeDefined()
  })

  it('should render next milestone preview', async () => {
    renderCompletion()

    expect(await screen.findByText('Storage Engine')).toBeDefined()
    expect(screen.getByText(/Build a storage engine/)).toBeDefined()
  })

  it('should render "Continue to Next Milestone" button', async () => {
    renderCompletion()

    const button = await screen.findByRole('button', { name: /continue to next milestone/i })
    expect(button).toBeDefined()
  })

  it('should show "Track Complete" and "Return to Overview" for last milestone', async () => {
    mockApiFetch.mockResolvedValue(LAST_MILESTONE_COMPLETION)
    renderCompletion('ms-last')

    expect(await screen.findByText('Track Complete')).toBeDefined()
    expect(screen.getByRole('button', { name: /return to overview/i })).toBeDefined()
  })

  it('should navigate to overview when Return to Overview is clicked', async () => {
    mockApiFetch.mockResolvedValue(LAST_MILESTONE_COMPLETION)
    renderCompletion('ms-last')

    const button = await screen.findByRole('button', { name: /return to overview/i })
    await userEvent.click(button)

    expect(mockNavigate).toHaveBeenCalledWith('/overview')
  })

  it('should show trajectory placeholder with placeholder text', async () => {
    renderCompletion()

    expect(await screen.findByText(/Performance trajectory — available after benchmark integration/)).toBeDefined()
  })

  it('should show loading skeleton initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})) // never resolves
    renderCompletion()

    expect(screen.getByTestId('completion-skeleton')).toBeDefined()
  })

  it('should show error state with retry button', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))
    renderCompletion()

    expect(await screen.findByText(/Failed to load completion data/)).toBeDefined()
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined()
  })

  it('should not contain celebration elements or red colors', async () => {
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)

    const container = document.body
    expect(container.textContent).not.toContain('Congratulations')
    expect(container.textContent).not.toContain('Great job')
    expect(container.textContent).not.toContain('Well done')
    expect(container.innerHTML).not.toContain('text-destructive')
    expect(container.innerHTML).not.toContain('confetti')
  })

  it('should have aria-live announcement for screen readers', async () => {
    renderCompletion()

    await screen.findByText(/Simple Key-Value Store — Complete/)

    const announcement = screen.getByText(/Milestone 1 complete\. All criteria met\./)
    expect(announcement.getAttribute('aria-live')).toBe('assertive')
  })

  it('should navigate to next workspace when Continue button is clicked', async () => {
    renderCompletion()

    const button = await screen.findByRole('button', { name: /continue to next milestone/i })
    await userEvent.click(button)

    expect(mockNavigate).toHaveBeenCalledWith('/workspace/ms-2', { replace: true })
  })
})
