/**
 * Cookie-based persistent user identity for the 灵 (Ling) system.
 *
 * On first visit, generates a UUID via crypto.randomUUID() and stores it
 * in a cookie named `ling_uid` with a 365-day expiry.
 * On subsequent visits, reads the existing cookie value.
 */

const COOKIE_NAME = 'ling_uid';
const MAX_AGE_DAYS = 365;

function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number): void {
  const maxAge = days * 24 * 60 * 60; // seconds
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

let cachedUid: string | null = null;

export function getUserId(): string {
  if (cachedUid) return cachedUid;

  let uid = getCookie(COOKIE_NAME);
  if (!uid) {
    uid = crypto.randomUUID();
    setCookie(COOKIE_NAME, uid, MAX_AGE_DAYS);
    if (import.meta.env.DEV) console.log('[user-identity] New user, generated ling_uid:', uid);
  } else {
    if (import.meta.env.DEV) console.log('[user-identity] Returning user, ling_uid:', uid);
  }

  cachedUid = uid;
  return uid;
}
