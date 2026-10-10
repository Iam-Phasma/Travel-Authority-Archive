import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAccess, createDashboardAccess } from '../auth/page-access.js';

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};
const browser = (t) => {
  const old = { window: globalThis.window, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  globalThis.window = { location: { href: '' } };
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
  t.after(() => Object.assign(globalThis, old));
  t.mock.method(console, 'warn', () => {});
};
const client = (role, sessionToken = 'valid', session = { user: { id: 'user-1' }, access_token: 'jwt' }) => ({
  auth: { getSession: async () => ({ data: { session } }), signOut: async () => {} },
  from: () => ({ select: (columns) => ({ eq: () => ({ maybeSingle: async () => ({ data: columns === 'role' ? { role } : { session_token: sessionToken, control: 2 } }) }) }) }),
});

test('unauthenticated pages redirect before consulting profile data', async (t) => {
  browser(t);
  const supabase = client('user', null, null);
  supabase.from = () => { throw Error('Unexpected profile query'); };
  const admin = createAdminAccess({ supabase, setCurrentUserId() {}, markCurrentUserOffline() {}, clearAdminClientState() {} });
  assert.equal(await admin.requireAdmin(), null);
  assert.equal(window.location.href, '../index.html');
  window.location.href = '';
  await createDashboardAccess({ supabase, setCurrentUserId() {}, setUserRole() {} }).requireUser();
  assert.equal(window.location.href, '../index.html');
});

test('ordinary users cannot enter Admin and admins are redirected from the dashboard', async (t) => {
  browser(t);
  const admin = createAdminAccess({ supabase: client('user'), setCurrentUserId() {}, markCurrentUserOffline() {}, clearAdminClientState() {} });
  assert.equal(await admin.requireAdmin(), null);
  assert.equal(window.location.href, '../dashboard/dashboard.html');
  let role;
  await createDashboardAccess({ supabase: client('admin'), setCurrentUserId() {}, setUserRole: (value) => { role = value; } }).requireUser();
  assert.equal(role, 'admin');
  assert.equal(window.location.href, '../admin/admin.html');
});

test('Admin and Super Admin require matching session tokens and preserve control levels', async (t) => {
  browser(t);
  for (const role of ['admin', 'super']) {
    localStorage.setItem('admin_session_token', 'valid');
    let id;
    const admin = createAdminAccess({ supabase: client(role), setCurrentUserId: (value) => { id = value; }, markCurrentUserOffline() {}, clearAdminClientState() {} });
    assert.deepEqual(await admin.requireAdmin(), { role, control: 2 });
    assert.equal(id, 'user-1');
  }
  let signedOut = false;
  const supabase = client('admin', 'another-device');
  supabase.auth.signOut = async () => { signedOut = true; };
  const admin = createAdminAccess({ supabase, setCurrentUserId() {}, markCurrentUserOffline: async () => {}, clearAdminClientState() {} });
  assert.equal(await admin.requireAdmin(), undefined);
  assert.equal(signedOut, true);
  assert.equal(window.location.href, '../index.html');
});
