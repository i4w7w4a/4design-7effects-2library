import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { createPresetHandler } from './playground/presetApi.ts';

const rootDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: { host: '127.0.0.1' },
  plugins: [{
    name: 'local-preset-api',
    configureServer(server) {
      const handlePreset = createPresetHandler(rootDirectory);
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/api/presets') return next();
        void handlePreset(request, response);
      });
    },
  }],
  test: { exclude: ['tests/e2e/**', 'node_modules/**'] },
});
