// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import preact from '@astrojs/preact';
import mdx from '@astrojs/mdx';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// GitHub Pages serves a project site under /<repo>/. CI passes the prefix that
// actions/configure-pages reports; locally both are unset and the site is served from /.
const site = process.env.SITE_URL || 'http://localhost:4351';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [preact(), mdx()],
  markdown: {
    // Astro 7 defaults to Sätteri; KaTeX needs the remark/rehype pipeline.
    processor: unified({
      remarkPlugins: [remarkMath],
      // throwOnError: a formula KaTeX rejects must fail the build, never ship as raw TeX.
      rehypePlugins: [[rehypeKatex, { throwOnError: true, strict: 'error' }]],
    }),
  },
});
