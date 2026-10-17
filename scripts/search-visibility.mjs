const defaultProductionUrl = 'https://travel-authority-archive-fr1i.vercel.app/';

// Generate absolute discovery URLs from the same public deployment setting as auth.
export function searchVisibility(productionUrl = defaultProductionUrl) {
  const url = new URL(productionUrl || defaultProductionUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('VITE_PRODUCTION_URL must be a public HTTP(S) URL.');
  }
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  const canonical = url.href;
  const title = 'CHEDRO IV Travel Authority Archive | CTAA';
  const description = 'Access the CHEDRO IV Travel Authority Archive (CTAA), the travel authority records portal for Commission on Higher Education Regional Office IV personnel.';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'CHEDRO IV Travel Authority Archive',
    alternateName: 'CTAA',
    url: canonical,
    description,
    inLanguage: 'en',
  };
  const meta = (property, content) => ({ tag: 'meta', attrs: { property, content } });

  return {
    name: 'search-visibility',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (context.path !== '/index.html' && context.path !== '/') return;
        return [
          { tag: 'link', attrs: { rel: 'canonical', href: canonical } },
          meta('og:type', 'website'),
          meta('og:site_name', 'CHEDRO IV Travel Authority Archive'),
          meta('og:title', title),
          meta('og:description', description),
          meta('og:url', canonical),
          meta('og:image', new URL('assets/CHED-Logo.webp', canonical).href),
          meta('og:image:alt', 'Commission on Higher Education logo'),
          { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
          { tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(schema).replace(/</g, '\\u003c') },
        ];
      },
    },
    generateBundle() {
      // Let crawlers read noindex on protected pages; robots.txt is not access control.
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', canonical).href}\n` });
      const escapedUrl = canonical.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${escapedUrl}</loc></url>\n</urlset>\n` });
    },
  };
}
