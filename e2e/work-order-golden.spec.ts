import { test, expect } from '@playwright/test';

/**
 * Golden Path: Auftrag anlegen → Detail sichtbar → Status auf "in_progress" schalten
 */
test('Neuen Work-Order anlegen und Detail öffnen', async ({ page }) => {
  await page.goto('/work-orders');
  await expect(page.locator('h1').first()).toBeVisible();

  await page.getByRole('link', { name: /neuer? auftrag/i }).first().click();

  const uniqueTitle = `E2E Auftrag ${Date.now()}`;
  const titleInput = page.getByLabel(/titel/i).first();
  await expect(titleInput).toBeVisible();
  await titleInput.fill(uniqueTitle);

  // Beschreibung falls Feld existiert
  const descInput = page.getByLabel(/beschreibung/i).first();
  if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await descInput.fill('Automatisch erzeugt durch Playwright E2E-Test.');
  }

  // Submit
  await page.getByRole('button', { name: /speichern|anlegen|erstellen/i }).first().click();

  // Nach Anlegen sollte man auf der Detail-Seite oder Liste sein
  await expect(page).toHaveURL(/\/work-orders/, { timeout: 10_000 });

  // Titel muss irgendwo auf der Seite sichtbar sein
  await expect(page.getByText(uniqueTitle, { exact: false }).first()).toBeVisible({
    timeout: 10_000,
  });
});
