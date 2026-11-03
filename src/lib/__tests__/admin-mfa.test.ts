/** @jest-environment node */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

let claims: Record<string, unknown> | null = null;
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null, error: null }) } }),
}));

import { middleware } from '@/middleware';
import { adminAccess } from '@/lib/admin-access';
import { adminMfaGate } from '@/lib/mfa';

const ADMIN = 'ops@pentriq.example';
const as = (email: string, aal: 'aal1' | 'aal2', enrolled = false) => ({ sub: 'u-1', email, aal, app_metadata: { mfa_enrolled: enrolled } });
const get = (path: string) => middleware(new NextRequest(new URL(path, 'https://pentriq.example')));

const original = process.env.ADMIN_EMAIL;
beforeEach(() => {
  process.env.ADMIN_EMAIL = ADMIN;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});
afterEach(() => {
  process.env.ADMIN_EMAIL = original;
  claims = null;
});

describe('admin access needs an admin email and a two-factor session', () => {
  it('decides from email, assurance level and enrolment', () => {
    expect(adminAccess(null)).toBe('forbidden');
    expect(adminAccess({ email: 'someone@else.example', aal: 'aal2', mfaEnrolled: true })).toBe('forbidden');
    expect(adminAccess({ email: ADMIN, aal: 'aal1', mfaEnrolled: false })).toBe('enroll');
    expect(adminAccess({ email: ADMIN, aal: 'aal1', mfaEnrolled: true })).toBe('verify');
    expect(adminAccess({ email: ADMIN.toUpperCase(), aal: 'aal2', mfaEnrolled: true })).toBe('ok');
    expect(adminMfaGate(null, false)).toBe('enroll');
  });

  it('middleware: non-admins get a 403 on the portal and its API', async () => {
    claims = as('someone@else.example', 'aal2', true);
    expect((await get('/admin')).status).toBe(403);
    expect((await get('/api/admin/email-usage')).status).toBe(403);
  });

  it('middleware: an admin signed in with a password only is sent to set up or enter two-factor, and comes back after', async () => {
    claims = as(ADMIN, 'aal1', false);
    const enrol = await get('/admin/readiness');
    expect(enrol.status).toBe(307);
    expect(enrol.headers.get('location')).toBe('https://pentriq.example/account/security?setup=required&next=%2Fadmin%2Freadiness');

    claims = as(ADMIN, 'aal1', true);
    const verify = await get('/admin/organisations?page=2');
    expect(verify.headers.get('location')).toBe('https://pentriq.example/mfa?next=%2Fadmin%2Forganisations%3Fpage%3D2');

    const api = await get('/api/admin/email-usage');
    expect(api.status).toBe(403);
    expect(await api.json()).toEqual({ error: 'Two-factor authentication required.' });
  });

  it('middleware: an admin with a two-factor session gets through; other pages are unaffected', async () => {
    claims = as(ADMIN, 'aal2', true);
    const ok = await get('/admin');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('location')).toBeNull();
    expect(ok.headers.get('x-request-id')).toBeTruthy();

    claims = as(ADMIN, 'aal1', false);
    expect((await get('/dashboard')).status).toBe(200);
  });
});
