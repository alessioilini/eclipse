import { defineConfig } from '@playwright/test';

const baseURL = 'http://localhost:4173';

/** Сквозной тест (спека §1, критерий 7): собранное приложение под `vite preview`, телефон 390×844, Chromium. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
