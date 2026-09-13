// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { SidebarContent } from './sidebar'

const state = vi.hoisted(() => ({
  profile: undefined as undefined | { isSuperAdmin: boolean },
  access: undefined as undefined | { ok: boolean },
  pathname: '/crm',
  apps: undefined as undefined | {existingSuite:boolean},
}))

vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => ({ location: { pathname: state.pathname } }),
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) =>
    createElement('a', { ...props, href: to }, children),
}))

vi.mock('convex/react', () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference)
    if (name === 'userProfiles:me') return state.profile
    if (name === 'marketplace/access:marketplaceAccess') return state.access
    if (name === 'userProfiles:myTenants') return []
    if (name === 'appRequests:status') return state.apps
    return undefined
  },
}))

afterEach(cleanup)
beforeEach(() => {
  state.profile = undefined
  state.access = undefined
  state.pathname = '/crm'
  state.apps = undefined
})

describe('Leadgen navigation', () => {
  it('shows upsell while loading or without company suite access, even for superadmin',()=>{
    state.profile={isSuperAdmin:true};
    render(createElement(SidebarContent));
    expect(screen.queryByRole('link',{name:'Frostwork'})).toBeNull();
    expect(screen.getByRole('link',{name:'Apps & uitbreidingen'}).getAttribute('href')).toBe('/crm/apps');
  });
  it('preserves existing company suite navigation',()=>{
    state.apps={existingSuite:true};render(createElement(SidebarContent));
    expect(screen.getByRole('link',{name:'Frostwork'}).getAttribute('href')).toBe('https://frostwork.wetry.app/customers');
  });
  it('keeps restricted links hidden while access is loading', () => {
    render(createElement(SidebarContent))
    expect(screen.queryByRole('region', { name: 'Leadgenbeheer' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Marketplace' })).toBeNull()
  })

  it('lets a super-admin reach v2 intake without buyer access', () => {
    state.profile = { isSuperAdmin: true }
    state.access = { ok: false }
    render(createElement(SidebarContent))
    const leads = screen.getByRole('link', { name: /Binnengekomen leads/ })
    expect(leads.getAttribute('href')).toBe('/crm/leadgen')
    expect(leads.getAttribute('target')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Marketplace' })).toBeNull()
  })

  it('shows buyers the feed without exposing the admin shortcuts', () => {
    state.profile = { isSuperAdmin: false }
    state.access = { ok: true }
    render(createElement(SidebarContent))
    expect(screen.getByRole('link', { name: 'Offerteaanvragen' }).getAttribute('href')).toBe('/feed')
    expect(screen.queryByRole('region', { name: 'Leadgenbeheer' })).toBeNull()
  })

  it('highlights only purchased leads on the purchased page and closes the mobile menu', () => {
    state.access = { ok: true }
    state.pathname = '/feed/purchased'
    const onNavigate = vi.fn()
    const { container } = render(createElement(SidebarContent, { onNavigate }))
    const active = container.querySelectorAll('[aria-current="page"]')
    expect(active).toHaveLength(1)
    expect(active[0].getAttribute('href')).toBe('/feed/purchased')
    fireEvent.click(screen.getByRole('link', { name: 'Ontgrendelde leads' }))
    expect(onNavigate).toHaveBeenCalledOnce()
  })

  it('keeps the feed active while inspecting a lead', () => {
    state.access = { ok: true }
    state.pathname = '/feed/lead/example'
    render(createElement(SidebarContent))
    expect(screen.getByRole('link', { name: 'Offerteaanvragen' }).getAttribute('aria-current')).toBe('page')
  })
})
