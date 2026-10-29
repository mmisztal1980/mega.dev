import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { fileURLToPath } from 'node:url';

// Build setup added outside the export: the kb came as src/ only.
export default {
  extensions: ['.svelte', '.svx'],
  preprocess: [
    vitePreprocess(),
    mdsvex({ extensions: ['.svx'], layout: { runbook: fileURLToPath(new URL('./src/lib/layouts/runbook.svelte', import.meta.url)) } }),
  ],
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', strict: false }),
    alias: { '#lib': 'src/lib', '#lib/*': 'src/lib/*' },
    prerender: { entries: ['/kb'], handleHttpError: 'warn' },
  },
};
