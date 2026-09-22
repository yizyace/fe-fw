import { defineConfig } from '@playwright/test';
import readerConfig from './playwright.config';

export default defineConfig({
  ...readerConfig,
  testDir: './tests/pages',
  use: { ...readerConfig.use, baseURL: 'http://127.0.0.1:4174/fe-fw/' },
  webServer: {
    command: 'pnpm build:pages && pnpm preview:pages',
    url: 'http://127.0.0.1:4174/fe-fw/',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
