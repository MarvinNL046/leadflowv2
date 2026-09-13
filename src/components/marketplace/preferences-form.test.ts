// @vitest-environment jsdom
import {createElement} from 'react'
import {test,expect,vi,afterEach,beforeEach} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {PreferencesForm} from './preferences-form'
import {PurchaseModal} from './purchase-modal'
import type {Id} from '../../../convex/_generated/dataModel'
const save=vi.hoisted(()=>vi.fn())
const access=vi.hoisted(()=>vi.fn())
vi.mock('convex/react',()=>({useMutation:()=>save,useQuery:()=>access()}))
vi.mock('@tanstack/react-router',()=>({useNavigate:()=>vi.fn()}))
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}))
beforeEach(()=>{save.mockReset().mockResolvedValue({success:true});access.mockReturnValue({ok:true,canManage:true})})
afterEach(cleanup)

test('saves the chosen province and sends explicit null when clearing service selection',async()=>{
  render(createElement(PreferencesForm,{mode:'settings',initial:{niches:['airco'],preferredMode:'both',notifyOnNewLead:true,serviceTypes:['install'],provinces:['Limburg']}}))
  expect(screen.getByRole('button',{name:'Limburg'}).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button',{name:'Repareren'}))
  fireEvent.click(screen.getByRole('button',{name:'Onderhouden'}))
  fireEvent.click(screen.getByRole('button',{name:'Opslaan'}))
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({serviceTypes:null,provinces:['Limburg'],notifyChannel:'email'})))
})

test('shared purchase explains the exact total number of buyers',()=>{
  render(createElement(PurchaseModal,{leadId:'synthetic' as Id<'marketplaceLeads'>,mode:'shared',priceCents:1740,maxSharedBuyers:3,open:true,onOpenChange:vi.fn(),onPurchased:vi.fn()}))
  expect(screen.getByText('Je deelt deze aanvraag met maximaal 2 andere installateurs (3 kopers totaal).')).toBeTruthy()
  expect(screen.getByRole('button',{name:'Koop gedeeld €17,40'})).toBeTruthy()
})

test('member sees why buying is unavailable and cannot submit a purchase',()=>{
  access.mockReturnValue({ok:true,canManage:false})
  render(createElement(PurchaseModal,{leadId:'synthetic' as Id<'marketplaceLeads'>,mode:'shared',priceCents:1740,maxSharedBuyers:3,open:true,onOpenChange:vi.fn(),onPurchased:vi.fn()}))
  expect(screen.getByText('Alleen een eigenaar of bedrijfsbeheerder kan leads kopen.')).toBeTruthy()
  const button=screen.getByRole('button',{name:'Koop gedeeld €17,40'}) as HTMLButtonElement
  expect(button.disabled).toBe(true);fireEvent.click(button);expect(save).not.toHaveBeenCalled()
})
