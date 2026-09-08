import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// Tabulator hardcodes role="grid" on its wrapper div and then inserts its own
// scrolling wrapper (div.tabulator-tableholder) as that div's direct child —
// ARIA requires a grid's children to be row/rowgroup, so this specific check
// always fails regardless of app markup. It's baked into the library (see
// tabulator_esm.js, setAttribute("role", "grid")) and not exposed as a
// config option, so it's excluded here rather than papering over it with a
// DOM patch that would need to be reapplied on every redraw/filter/sort.
function checkA11y(page: Page) {
  return new AxeBuilder({ page }).disableRules(['aria-required-children']).analyze();
}

// Run every check under both color schemes: the CSS has a dark-mode media
// query with its own token values (and its own hardcoded-color collisions
// with Tabulator's default theme), which a light-only run can't see —
// Playwright/Chromium default to light, so that's what silently shipped a
// light-on-light header in dark mode before this loop existed.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`color-scheme: ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('default view has no automatically detectable accessibility violations', async ({ page }) => {
      await page.goto('/');
      await page.locator('.tabulator-row').first().waitFor();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
    });

    test('label filter menu has no accessibility violations when open', async ({ page }) => {
      await page.goto('/');
      await page.click('#label-filter-toggle');
      await expect(page.locator('.multiselect-menu')).toBeVisible();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
    });

    test('expanded issue details has no accessibility violations', async ({ page }) => {
      await page.goto('/');
      const toggle = page.locator('[data-action="toggle-details"]').first();
      test.skip((await toggle.count()) === 0, 'no issue with expandable details in current data');

      await toggle.click();
      await expect(page.locator('.issue-details').first()).toBeVisible();

      const results = await checkA11y(page);
      expect(results.violations).toEqual([]);
    });
  });
}
