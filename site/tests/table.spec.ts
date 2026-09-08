import { test, expect } from '@playwright/test';
import issuesData from '../src/data/issues.json' with { type: 'json' };

const issues = issuesData.issues;
const openIssues = issues.filter((i) => i.state === 'open');

test('defaults to showing only open issues', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('.tabulator-row');
  await expect(rows).toHaveCount(openIssues.length);
});

test('search narrows rows and matches the term', async ({ page }) => {
  await page.goto('/');
  const term = 'rust';
  const target = openIssues.find((i) => i.title.toLowerCase().includes(term));
  test.skip(!target, 'no open sample issue with "rust" in the title in current data');

  // The app matches on title OR description, so a matched row's visible text
  // won't contain the term when the match came from its (collapsed by
  // default) description — assert against issue number, not row text.
  const expectedMatches = openIssues.filter(
    (i) => i.title.toLowerCase().includes(term) || (i.description ?? '').toLowerCase().includes(term),
  );
  expect(expectedMatches.length).toBeLessThan(openIssues.length);

  await page.getByPlaceholder('Search title, description…').fill(term);
  const rows = page.locator('.tabulator-row');
  await expect(rows).toHaveCount(expectedMatches.length);

  const expectedNumbers = expectedMatches.map((i) => i.number).sort();
  const shownNumbers = (
    await Promise.all(
      (await rows.all()).map(async (row) => {
        const href = await row.locator('.tabulator-cell[tabulator-field="number"] a').getAttribute('href');
        return Number(href!.split('/').pop());
      }),
    )
  ).sort();
  expect(shownNumbers).toEqual(expectedNumbers);

  await expect(
    page.locator('.tabulator-row', { has: page.locator(`a:text-is("#${target!.number}")`) }),
  ).toContainText(/rust/i);
});

test('reset clears search and restores the default open filter', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Search title, description…').fill('rust');
  await expect(page.locator('.tabulator-row')).not.toHaveCount(openIssues.length);

  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.tabulator-row')).toHaveCount(openIssues.length);
  await expect(page.getByPlaceholder('Search title, description…')).toHaveValue('');
});

test('sorting by thumbs-up orders rows descending', async ({ page }) => {
  await page.goto('/');
  // First click sorts descending (headerSortStartingDir: 'desc').
  await page.getByText('👍', { exact: true }).click();

  const expectedMax = Math.max(...openIssues.map((i) => i.reactions['+1'] ?? 0));
  const firstRowThumbsUp = page.locator('.tabulator-row').first().locator('.tabulator-cell').nth(3);
  await expect(firstRowThumbsUp).toHaveText(String(expectedMax));
});

test('state header filter shows only closed issues', async ({ page }) => {
  await page.goto('/');
  const closedCount = issues.filter((i) => i.state === 'closed').length;
  test.skip(closedCount === 0, 'no closed issues in current data');

  await page.locator('.tabulator-col[tabulator-field="state"] .tabulator-header-filter input').click();
  await page.locator('.tabulator-edit-list-item', { hasText: 'closed' }).click();

  await expect(page.locator('.tabulator-row')).toHaveCount(closedCount);
});

test('project status filter narrows rows', async ({ page }) => {
  await page.goto('/');
  const status = openIssues.map((i) => i.project_status).find((s): s is string => !!s);
  test.skip(!status, 'no open issue with a project status in current data');
  const expectedCount = openIssues.filter((i) => i.project_status === status).length;

  await page.selectOption('#filter-status', status!);

  await expect(page.locator('.tabulator-row')).toHaveCount(expectedCount);
  for (const row of await page.locator('.tabulator-row').all()) {
    await expect(row).toContainText(status!);
  }
});

test('labels filter supports selecting more than one label', async ({ page }) => {
  await page.goto('/');
  const labelCounts = new Map<string, number>();
  for (const issue of openIssues) {
    for (const label of issue.labels) {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
  }
  const [firstLabel, secondLabel] = [...labelCounts.keys()];
  test.skip(!firstLabel || !secondLabel, 'need at least two distinct labels among open issues');

  const expectedCount = openIssues.filter(
    (i) => i.labels.includes(firstLabel) && i.labels.includes(secondLabel),
  ).length;

  await page.click('#label-filter-toggle');
  await page.getByRole('checkbox').and(page.locator(`[value="${firstLabel}"]`)).check();
  await page.getByRole('checkbox').and(page.locator(`[value="${secondLabel}"]`)).check();

  await expect(page.locator('#label-filter-toggle')).toHaveText('Labels (2)');
  await expect(page.locator('.tabulator-row')).toHaveCount(expectedCount);
});

test('search does not match on label text alone', async ({ page }) => {
  await page.goto('/');
  const labelOnlyMatch = openIssues.find(
    (i) =>
      i.labels.some((l) => l.toLowerCase() === 'templates') &&
      !i.title.toLowerCase().includes('template') &&
      !(i.description ?? '').toLowerCase().includes('template'),
  );
  test.skip(!labelOnlyMatch, 'no open issue labelled "Templates" without the word in its title/description');

  await page.getByPlaceholder('Search title, description…').fill('Templates');
  await expect(page.locator('.tabulator-row', { hasText: `#${labelOnlyMatch!.number}` })).toHaveCount(0);
});

test('top commenters shows 3 by default with an expand toggle for the rest', async ({ page }) => {
  await page.goto('/');
  const target = openIssues.find((i) => Object.keys(i.comments_by_user).length > 3);
  test.skip(!target, 'no open issue with more than 3 commenters in current data');
  const extra = Object.keys(target!.comments_by_user).length - 3;

  const row = page.locator('.tabulator-row').filter({ has: page.locator(`a:text-is("#${target!.number}")`) });
  const toggle = row.locator('[data-action="toggle-commenters"]');
  await expect(toggle).toHaveText(`+${extra} more`);

  await toggle.click();
  await expect(row.locator('[data-action="toggle-commenters"]')).toHaveText('Show less');
});

test('description is hidden until expanded', async ({ page }) => {
  await page.goto('/');
  const target = openIssues.find((i) => i.description);
  test.skip(!target, 'no open issue with a description in current data');

  const row = page.locator('.tabulator-row').filter({ has: page.locator(`a:text-is("#${target!.number}")`) });
  await expect(row.locator('.issue-details')).toHaveCount(0);

  await row.locator('[data-action="toggle-details"]').click();
  await expect(row.locator('.issue-details')).toBeVisible();
});

test('clicking a label chip adds it to the label filter', async ({ page }) => {
  await page.goto('/');
  const target = openIssues.find((i) => i.labels.length > 0);
  test.skip(!target, 'no open issue with a label in current data');
  const label = target!.labels[0];
  const expectedCount = openIssues.filter((i) => i.labels.includes(label)).length;

  await page
    .locator('.tabulator-row')
    .filter({ has: page.locator(`a:text-is("#${target!.number}")`) })
    .locator(`.chip[data-label="${label}"]`)
    .click();

  await expect(page.locator('#label-filter-toggle')).toHaveText('Labels (1)');
  await expect(page.locator('.tabulator-row')).toHaveCount(expectedCount);
});

test('filter changes update the URL and the back button restores prior state', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/state=open/);

  await page.getByPlaceholder('Search title, description…').fill('rust');
  await expect(page).toHaveURL(/q=rust/, { timeout: 2000 });

  await page.goBack();
  await expect(page.getByPlaceholder('Search title, description…')).toHaveValue('');
  await expect(page.locator('.tabulator-row')).toHaveCount(openIssues.length);
});

test('result count reflects the active filter', async ({ page }) => {
  await page.goto('/');
  // The default view already has the state=open header filter active, so
  // "shown" (open issues) is less than "total" (all issues) even before
  // any search/status/label filter is applied.
  await expect(page.locator('#result-count')).toHaveText(
    `Showing ${openIssues.length} of ${issues.length} issues.`,
  );

  await page.getByPlaceholder('Search title, description…').fill('rust');
  const shown = await page.locator('.tabulator-row').count();
  await expect(page.locator('#result-count')).toHaveText(`Showing ${shown} of ${issues.length} issues.`);
});

test('sort summary describes the current sort in human language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#sort-summary')).toHaveText('Sorted by most reactions.');

  await page.getByText('👍', { exact: true }).click();
  await expect(page.locator('#sort-summary')).toHaveText('Sorted by most thumbs up.');
});

test('clicking a sortable header keeps the scroll position', async ({ page }) => {
  await page.goto('/');
  const holder = page.locator('.tabulator-tableholder');
  await holder.evaluate((el) => {
    el.scrollTop = 400;
  });

  await page.locator('.tabulator-col[tabulator-field="total_comments"] .tabulator-col-title-holder').click();
  await page.waitForTimeout(200);

  await expect
    .poll(() => holder.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(300);
});

test('share button copies the current URL', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');

  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(page.url());
});
