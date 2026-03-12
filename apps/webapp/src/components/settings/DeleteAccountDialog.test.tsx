import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteAccountDialog } from './DeleteAccountDialog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DeleteAccountDialog', () => {
  it('should render dialog title and description when open', () => {
    render(
      <DeleteAccountDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} isDeleting={false} />
    )

    expect(screen.getByText('Delete Account')).toBeDefined()
    expect(screen.getByText(/This action is permanent and cannot be undone/)).toBeDefined()
  })

  it('should render list of data to be deleted', () => {
    render(
      <DeleteAccountDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} isDeleting={false} />
    )

    expect(screen.getByText('Your profile and account information')).toBeDefined()
    expect(screen.getByText('All code submissions and snapshots')).toBeDefined()
    expect(screen.getByText('Benchmark results and progress data')).toBeDefined()
    expect(screen.getByText('AI tutor conversation history')).toBeDefined()
    expect(screen.getByText('Session summaries')).toBeDefined()
  })

  it('should call onConfirm when "Delete My Account" is clicked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(
      <DeleteAccountDialog open={true} onOpenChange={vi.fn()} onConfirm={onConfirm} isDeleting={false} />
    )

    await user.click(screen.getByRole('button', { name: 'Delete My Account' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('should show "Deleting…" text when isDeleting is true', () => {
    render(
      <DeleteAccountDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} isDeleting={true} />
    )

    expect(screen.getByText('Deleting\u2026')).toBeDefined()
  })

  it('should disable both buttons when isDeleting is true', () => {
    render(
      <DeleteAccountDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} isDeleting={true} />
    )

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    const deleteButton = screen.getByRole('button', { name: 'Deleting\u2026' })

    expect(cancelButton.hasAttribute('disabled')).toBe(true)
    expect(deleteButton.hasAttribute('disabled')).toBe(true)
  })

  it('should call onOpenChange(false) when Cancel is clicked', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(
      <DeleteAccountDialog open={true} onOpenChange={onOpenChange} onConfirm={vi.fn()} isDeleting={false} />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('should not render content when open is false', () => {
    render(
      <DeleteAccountDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} isDeleting={false} />
    )

    expect(screen.queryByText('Delete Account')).toBeNull()
  })
})
