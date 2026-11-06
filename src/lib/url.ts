const PAGES = Object.keys(import.meta.glob('/src/pages/**/*.astro'));

/** True when a page exists for this site path ('me/' → src/pages/me/index.astro or me.astro). */
export function pageExists(path: string): boolean {
  const p = path.replace(/^\/|\/$/g, '');
  return PAGES.includes(`/src/pages/${p}/index.astro`) || PAGES.includes(`/src/pages/${p}.astro`);
}

/** Site-relative link that respects the GitHub Pages base path ('/' locally, '/<repo>/' in CI). */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const p = path.replace(/^\//, '');
  return `${base}/${p}`;
}
