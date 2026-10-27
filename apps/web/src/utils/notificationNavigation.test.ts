import { afterEach, expect, it } from 'vitest';
import { pendingNotificationKey, pendingNotificationPath } from './notificationNavigation';

afterEach(() => sessionStorage.clear());
it('retains only local notification destinations until authentication completes', () => {
  const path = '/notifications?notification=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  sessionStorage.setItem(pendingNotificationKey, path);
  expect(pendingNotificationPath()).toBe(path);
  expect(sessionStorage.getItem(pendingNotificationKey)).toBe(path);
});
it.each([
  'https://untrusted.example',
  '//untrusted.example',
  '/notifications-other',
  '/notifications?next=https://untrusted.example',
  '/notifications?notification=invalid',
])('discards an invalid pending destination: %s', (path) => {
  sessionStorage.setItem(pendingNotificationKey, path);
  expect(pendingNotificationPath()).toBeNull();
  expect(sessionStorage.getItem(pendingNotificationKey)).toBeNull();
});
