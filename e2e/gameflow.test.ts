import { test, expect } from '@playwright/test';

test('loads synchronous home page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Synchronous Deliberation Engine' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Admin Panel' })).toBeVisible();
});
