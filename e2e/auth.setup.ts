import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth', 'user.json');

const email = process.env['E2E_TEST_EMAIL'];
const password = process.env['E2E_TEST_PASSWORD'];

setup('authenticate', async ({ page }) => {
  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL und E2E_TEST_PASSWORD müssen in .env.test.local gesetzt sein. Siehe .env.test.local.example.',
    );
  }

  // Sicherstellen dass Auth-Ordner existiert
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/passwort/i).fill(password);
  await page.getByRole('button', { name: /anmelden/i }).click();

  // Warten auf Redirect zum Dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // Session-State speichern
  await page.context().storageState({ path: authFile });
});
