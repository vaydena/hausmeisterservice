import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test-Credentials aus .env.test.local — Datei ist gitignored und muss lokal gepflegt werden.
dotenv.config({ path: path.join(__dirname, '.env.test.local') });

const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Multi-Tenant-DB — sequentiell fahren
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, 'e2e/.auth/user.json'),
      },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env['CI']
    ? {
        command: 'pnpm dev --port 3001',
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: 'pnpm dev --port 3001',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
