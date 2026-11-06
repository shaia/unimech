import { useEffect, useState } from 'preact/hooks';

/**
 * False on the server and on the first client render, true right after.
 *
 * Preact's hydrate() adopts the server HTML and does not correct attributes that differ, so an
 * island whose first client render reads browser state (saved progress, settings) would keep
 * the server's classes and aria values. Islands render the server view until mounted, then
 * re-render with the real state, which is a normal diff that patches everything.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
