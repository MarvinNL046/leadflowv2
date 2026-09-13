// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MarketplaceStart } from './marketplace-start'
const state = vi.hoisted(() => ({ role: 'owner', enable: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: () => [{ role: state.role, org: { id: 'org-a' }, workspace: { id: 'workspace-a' } }], useMutation: () => state.enable }))
afterEach(cleanup)
beforeEach(() => { state.role = 'owner'; state.enable.mockReset() })
it('requires an explicit owner action and displays a denied activation', async () => {
  state.enable.mockResolvedValue({ success: false, error: 'forbidden' })
  render(createElement(MarketplaceStart))
  expect(state.enable).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Marketplace voor mijn bedrijf activeren' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Alleen een eigenaar'))
  expect(state.enable).toHaveBeenCalledWith({ orgId: 'org-a' })
})
it('offers members guidance without an activation button', () => {
  state.role = 'member'
  render(createElement(MarketplaceStart))
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText(/Vraag de eigenaar/)).toBeTruthy()
  expect(state.enable).not.toHaveBeenCalled()
})
