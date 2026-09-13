// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ContactTasks } from './contact-tasks'
import type { Id } from '../../../convex/_generated/dataModel'

const mock = vi.hoisted(() => ({ create: vi.fn(), error: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: () => [], useMutation: () => mock.create }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mock.error } }))
afterEach(cleanup)
beforeEach(() => { mock.create.mockReset(); mock.error.mockReset() })

it('keeps entered follow-up on a failed save so the user can retry', async () => {
  mock.create.mockRejectedValue(new Error('Opslaan mislukt'))
  render(createElement(ContactTasks, { contactId: 'contact-a' as Id<'contacts'> }))
  fireEvent.change(screen.getByLabelText('Nieuwe opvolgtaak'), { target: { value: 'Afspraak controleren' } })
  fireEvent.click(screen.getByRole('button', { name: 'Taak opslaan' }))
  await waitFor(() => expect(mock.error).toHaveBeenCalled())
  expect((screen.getByLabelText('Nieuwe opvolgtaak') as HTMLInputElement).value).toBe('Afspraak controleren')
})

it('prevents a second submission while saving and uses the current contact', async () => {
  mock.create.mockReturnValue(new Promise(() => {}))
  render(createElement(ContactTasks, { contactId: 'contact-a' as Id<'contacts'> }))
  fireEvent.change(screen.getByLabelText('Nieuwe opvolgtaak'), { target: { value: 'Afspraak controleren' } })
  const form = screen.getByRole('button', { name: 'Taak opslaan' }).closest('form')!
  fireEvent.submit(form); fireEvent.submit(form)
  expect(mock.create).toHaveBeenCalledTimes(1)
  expect(mock.create.mock.calls[0][0].contactId).toBe('contact-a')
})
