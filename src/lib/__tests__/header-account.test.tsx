/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const getSession = jest.fn<() => Promise<{ data: { session: unknown } }>>();
const createClient = jest.fn(() => ({
  auth: { getSession, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
}));

jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...p }, children) }));
jest.mock('@/lib/supabase/client', () => ({ createClient: () => createClient() }));
jest.mock('@/components/sidebar-nav', () => ({
  navGroups: [
    { label: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard' }] },
    { label: 'Audience', items: [{ href: '/customers', label: 'Customers' }] },
    { label: 'Resources', items: [{ href: '/blog', label: 'Blog' }, { href: '/changelog', label: 'Changelog' }] },
  ],
}));

import { HeaderAccount, MobileAccountLinks } from '@/components/marketing/header-account';

let root: Root;
let host: HTMLElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = async (el: React.ReactElement) => {
  await act(async () => root.render(el));
  await flush();
};
const text = () => host.textContent ?? '';
const links = () => [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
const setCookie = (c: string) => Object.defineProperty(document, 'cookie', { configurable: true, get: () => c });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  getSession.mockReset();
  createClient.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('public header for signed-in users', () => {
  it('visitors with no sign-in cookie see Log in / Get started, and never load the auth client', async () => {
    setCookie('theme=dark');
    await render(<HeaderAccount />);
    expect(links()).toEqual(['/login', '/signup']);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('a signed-in user gets Dashboard and the full app menu instead of Log in / Get started', async () => {
    setCookie('sb-abc-auth-token=base64-xyz');
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    await render(<HeaderAccount />);
    expect(text()).toContain('App menu');
    expect(text()).not.toContain('Get started');
    expect(text()).not.toContain('Log in');
    expect(links()).toEqual(expect.arrayContaining(['/dashboard', '/customers', '/blog', '/changelog']));
    expect(links()).not.toContain('/login');
    expect(links()).not.toContain('/signup');
  });

  it('a leftover cookie without a valid session still shows the visitor header', async () => {
    setCookie('sb-abc-auth-token=expired');
    getSession.mockResolvedValue({ data: { session: null } });
    await render(<HeaderAccount />);
    expect(links()).toEqual(['/login', '/signup']);
  });

  it('the mobile menu lists the app navigation for a signed-in user and just Log in for a visitor', async () => {
    setCookie('sb-abc-auth-token=base64-xyz');
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    await render(<MobileAccountLinks />);
    expect(links()).toEqual(['/dashboard', '/dashboard', '/customers', '/blog', '/changelog']);

    act(() => root.unmount());
    root = createRoot(host);
    setCookie('');
    await render(<MobileAccountLinks />);
    expect(links()).toEqual(['/login']);
  });
});
