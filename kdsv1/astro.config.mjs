// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const date = new Date();
const buildDate = date.toLocaleDateString('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

export default defineConfig({
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    define: {
      'import.meta.env.PUBLIC_APP_VERSION': JSON.stringify(pkg.version),
      'import.meta.env.PUBLIC_BUILD_DATE': JSON.stringify(buildDate),
    }
  }
});