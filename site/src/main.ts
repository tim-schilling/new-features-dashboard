import { TabulatorFull as Tabulator, type CellComponent } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator.min.css';
import rawData from './data/issues.json';
import './style.css';

interface Issue {
  number: number;
  title: string;
  url: string;
  state: string;
  project_status: string | null;
  labels: string[];
  reactions: Record<string, number>;
  reactions_users: Record<string, string[]>;
  total_reactions: number;
  comments_by_user: Record<string, number>;
  total_comments: number;
  description: string | null;
}

interface DataFile {
  repo: string;
  generated_at: string;
  issues: Issue[];
}

interface Row extends Issue {
  topCommenters: string;
  allCommenters: [string, number][];
  thumbsUp: number;
  thumbsDown: number;
  reactionCounts: Record<string, number>;
  ratio: number;
}

const data = rawData as unknown as DataFile;

function sortedCommenters(commentsByUser: Record<string, number>): [string, number][] {
  return Object.entries(commentsByUser).sort((a, b) => b[1] - a[1]);
}

function topCommentersDisplay(entries: [string, number][], n = 3): string {
  return entries
    .slice(0, n)
    .map(([user, count]) => `${user} (${count})`)
    .join(', ');
}

const REACTION_TYPES: { key: string; emoji: string; title: string }[] = [
  { key: 'hooray', emoji: '🎉', title: 'hooray' },
  { key: 'confused', emoji: '😕', title: 'confused' },
];

function computeRatio(thumbsUp: number, thumbsDown: number): number {
  if (thumbsUp === 0) return thumbsDown === 0 ? 0 : Infinity;
  return thumbsDown / thumbsUp;
}

function formatRatio(ratio: number): string {
  if (ratio === Infinity) return '∞';
  return ratio.toFixed(2);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultiline(s: string): string {
  return escapeHtml(s.trim()).replace(/\n/g, '<br>');
}

const rows: Row[] = data.issues.map((issue) => {
  const thumbsUp = issue.reactions['+1'] ?? 0;
  const thumbsDown = issue.reactions['-1'] ?? 0;
  const reactionCounts = Object.fromEntries(
    REACTION_TYPES.map(({ key }) => [key, issue.reactions[key] ?? 0]),
  );
  const allCommenters = sortedCommenters(issue.comments_by_user);
  return {
    ...issue,
    topCommenters: topCommentersDisplay(allCommenters),
    allCommenters,
    thumbsUp,
    thumbsDown,
    reactionCounts,
    ratio: computeRatio(thumbsUp, thumbsDown),
  };
});

const projectStatuses = Array.from(
  new Set(data.issues.map((i) => i.project_status).filter((s): s is string => !!s)),
).sort();

const allLabels = Array.from(new Set(data.issues.flatMap((i) => i.labels))).sort();

// Rows with their description or full commenter list expanded.
// Kept outside Tabulator's data model since these are pure display toggles;
// formatters read from these Sets on every redraw.
const expandedDetails = new Set<number>();
const expandedCommenters = new Set<number>();

const DEFAULT_SORT: { column: string; dir: 'asc' | 'desc' }[] = [
  { column: 'total_reactions', dir: 'desc' },
];

interface UrlState {
  q: string;
  status: string;
  labels: string[];
  state: string;
  sort: { column: string; dir: 'asc' | 'desc' }[];
}

function parseSortParam(param: string | null): { column: string; dir: 'asc' | 'desc' }[] {
  if (!param) return [];
  return param
    .split(',')
    .map((part) => {
      const [column, dir] = part.split(':');
      return column ? { column, dir: (dir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc' } : null;
    })
    .filter((s): s is { column: string; dir: 'asc' | 'desc' } => s !== null);
}

function serializeSort(sorters: { field: string; dir: string }[]): string {
  return sorters.map((s) => `${s.field}:${s.dir}`).join(',');
}

const SORT_FIELD_LABELS: Record<string, { asc: string; desc: string }> = {
  number: { asc: 'oldest issues first', desc: 'newest issues first' },
  title: { asc: 'title (A–Z)', desc: 'title (Z–A)' },
  total_reactions: { asc: 'fewest reactions', desc: 'most reactions' },
  thumbsUp: { asc: 'fewest thumbs up', desc: 'most thumbs up' },
  thumbsDown: { asc: 'fewest thumbs down', desc: 'most thumbs down' },
  'reactionCounts.hooray': { asc: 'fewest hooray reactions', desc: 'most hooray reactions' },
  'reactionCounts.confused': { asc: 'fewest confused reactions', desc: 'most confused reactions' },
  ratio: { asc: 'most positive ratio', desc: 'most negative ratio' },
  total_comments: { asc: 'fewest comments', desc: 'most comments' },
  topCommenters: { asc: 'top commenters (A–Z)', desc: 'top commenters (Z–A)' },
  state: { asc: 'state (A–Z)', desc: 'state (Z–A)' },
};

function describeSort(sorters: { field: string; dir: string }[]): string {
  if (sorters.length === 0) return 'Not sorted.';
  const parts = sorters.map((s) => {
    const labels = SORT_FIELD_LABELS[s.field];
    if (!labels) return `${s.field} (${s.dir === 'asc' ? 'ascending' : 'descending'})`;
    return s.dir === 'asc' ? labels.asc : labels.desc;
  });
  if (parts.length === 1) return `Sorted by ${parts[0]}.`;
  return `Sorted by ${parts.slice(0, -1).join(', then ')}, then ${parts[parts.length - 1]}.`;
}

function readUrlState(): UrlState {
  const params = new URLSearchParams(location.search);
  return {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    labels: params.getAll('label'),
    state: params.has('state') ? (params.get('state') ?? '') : 'open',
    sort: parseSortParam(params.get('sort')),
  };
}

const initialUrlState = readUrlState();

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header>
    <h1>Django New Features (<a href="https://github.com/orgs/django/projects/24" target="_blank" rel="noopener">repo</a>)</h1>
    <p class="meta">Data generated ${new Date(data.generated_at).toLocaleString()}</p>
  </header>
  <main>
  <div class="controls">
    <input id="search" type="search" placeholder="Search title, description…" value="${escapeHtml(initialUrlState.q)}" />
    <select id="filter-status" aria-label="Filter by project status">
      <option value="">All project statuses</option>
      ${projectStatuses
        .map(
          (s) =>
            `<option value="${escapeHtml(s)}" ${s === initialUrlState.status ? 'selected' : ''}>${escapeHtml(s)}</option>`,
        )
        .join('')}
    </select>
    <div class="multiselect" id="label-filter">
      <button type="button" class="multiselect-toggle" id="label-filter-toggle" aria-haspopup="true" aria-expanded="false">
        Labels
      </button>
      <div class="multiselect-menu" id="label-filter-menu" hidden>
        ${allLabels
          .map(
            (l) =>
              `<label class="multiselect-option"><input type="checkbox" value="${escapeHtml(l)}" ${initialUrlState.labels.includes(l) ? 'checked' : ''} />${escapeHtml(l)}</label>`,
          )
          .join('')}
      </div>
    </div>
    <button id="reset">Reset filters</button>
    <button id="share">Share</button>
  </div>
  <p class="sort-hint">
    <span id="result-count"></span>
    <span id="sort-summary" class="sort-summary"></span>
  </p>
  <p class="sort-hint">Tip: shift+click a column header to add a secondary sort key.</p>
  <div id="table"></div>
  </main>
`;

const table = new Tabulator('#table', {
  data: rows,
  // fitDataStretch ignores widthGrow entirely (it just measures each
  // column's natural content width, then stretches only the last column) —
  // fitColumns is what actually distributes space by widthGrow ratio.
  layout: 'fitColumns',
  height: '78vh',
  reactiveData: false,
  // Card rows vary a lot in height (description/labels/last comment are
  // optional), which breaks virtual scroll's row-height estimation and
  // causes jumpy scrolling — render all rows instead.
  renderVertical: 'basic',
  initialSort: initialUrlState.sort.length ? initialUrlState.sort : DEFAULT_SORT,
  initialHeaderFilter: [{ field: 'state', value: initialUrlState.state }],
  columnDefaults: {
    headerSortStartingDir: 'desc',
  },
  columns: [
    {
      title: '#',
      field: 'number',
      width: 70,
      sorter: 'number',
      formatter: (cell: CellComponent) => {
        const row = cell.getRow().getData() as Row;
        return `<a href="${row.url}" target="_blank" rel="noopener">#${row.number}</a>`;
      },
    },
    {
      title: 'Title',
      field: 'title',
      widthGrow: 2,
      minWidth: 220,
      formatter: (cell: CellComponent) => {
        const row = cell.getRow().getData() as Row;
        const statusHtml = row.project_status
          ? `<span class="status-badge">${escapeHtml(row.project_status)}</span>`
          : '';
        const labelsHtml = row.labels.length
          ? `<div class="label-chips">${row.labels
              .map((l) => {
                const active = selectedLabels().includes(l);
                return `<button type="button" class="chip${active ? ' chip-active' : ''}" data-action="filter-label" data-label="${escapeHtml(l)}" title="${active ? 'Remove from' : 'Add to'} label filter">${escapeHtml(l)}</button>`;
              })
              .join('')}</div>`
          : '';
        let detailsHtml = '';
        if (row.description) {
          const expanded = expandedDetails.has(row.number);
          detailsHtml = `
            <button type="button" class="link-toggle" data-action="toggle-details" data-number="${row.number}">${
              expanded ? 'Hide description ▴' : 'Show description ▾'
            }</button>
            ${expanded ? `<div class="issue-details" tabindex="0" role="region" aria-label="Issue description"><div class="issue-desc">${formatMultiline(row.description)}</div></div>` : ''}
          `;
        }
        return `<div class="issue-card">
            <div class="issue-title">${escapeHtml(row.title)}</div>
            ${statusHtml}
            ${labelsHtml}
            ${detailsHtml}
          </div>`;
      },
    },
    {
      // Not rendered — exists only so the default sort (below) has an actual
      // column to target. Tabulator silently drops a sort whose field isn't
      // backed by a column definition, which is what happened here before.
      title: 'Total reactions',
      field: 'total_reactions',
      visible: false,
      sorter: 'number',
    },
    {
      title: '👍',
      field: 'thumbsUp',
      width: 56,
      sorter: 'number',
      hozAlign: 'right',
      headerFilter: 'number',
      headerFilterFunc: '>=',
      headerFilterParams: { min: 0, elementAttributes: { 'aria-label': 'Minimum thumbs up' } },
      headerTooltip: 'thumbs up — filter shows issues with at least this many',
    },
    {
      title: '👎',
      field: 'thumbsDown',
      width: 56,
      sorter: 'number',
      hozAlign: 'right',
      headerFilter: 'number',
      headerFilterFunc: '>=',
      headerFilterParams: { min: 0, elementAttributes: { 'aria-label': 'Minimum thumbs down' } },
      headerTooltip: 'thumbs down — filter shows issues with at least this many',
    },
    ...REACTION_TYPES.map(({ key, emoji, title }) => ({
      title: emoji,
      field: `reactionCounts.${key}`,
      width: 56,
      sorter: 'number' as const,
      hozAlign: 'right' as const,
      headerFilter: 'number' as const,
      headerFilterFunc: '>=' as const,
      headerFilterParams: { min: 0, elementAttributes: { 'aria-label': `Minimum ${title} reactions` } },
      headerTooltip: `${title} — filter shows issues with at least this many`,
    })),
    {
      title: 'Ratio 👎:👍',
      field: 'ratio',
      width: 100,
      sorter: (a: number, b: number) => a - b,
      hozAlign: 'right',
      headerTooltip: 'negative reactions divided by positive reactions',
      formatter: (cell: CellComponent) => formatRatio(cell.getValue() as number),
    },
    {
      title: 'Comments',
      field: 'total_comments',
      width: 100,
      sorter: 'number',
      hozAlign: 'right',
    },
    {
      title: 'Top commenters',
      field: 'topCommenters',
      widthGrow: 1.6,
      headerFilter: 'input',
      headerFilterParams: { elementAttributes: { 'aria-label': 'Filter by top commenter' } },
      formatter: (cell: CellComponent) => {
        const row = cell.getRow().getData() as Row;
        const entries = row.allCommenters;
        if (entries.length === 0) return '';
        const rest = entries.slice(3);
        const expanded = expandedCommenters.has(row.number);
        const shown = rest.length === 0 || expanded ? entries : entries.slice(0, 3);
        const lines = shown
          .map(([user, count]) => `<div class="commenter-line">${escapeHtml(user)} (${count})</div>`)
          .join('');
        const toggle =
          rest.length > 0
            ? `<button type="button" class="link-toggle" data-action="toggle-commenters" data-number="${row.number}">${
                expanded ? 'Show less' : `+${rest.length} more`
              }</button>`
            : '';
        return `<div class="commenters">${lines}${toggle}</div>`;
      },
    },
    {
      title: 'State',
      field: 'state',
      width: 100,
      headerFilter: 'list',
      headerFilterParams: {
        values: ['open', 'closed'],
        clearable: true,
        elementAttributes: { 'aria-label': 'Filter by state' },
      },
      headerFilterFunc: '=',
    },
  ],
});

const sortSummaryEl = document.querySelector<HTMLSpanElement>('#sort-summary')!;
const resultCountEl = document.querySelector<HTMLSpanElement>('#result-count')!;

function updateSortSummary() {
  sortSummaryEl.textContent = describeSort(table.getSorters());
}

function updateResultCount(activeRowCount?: number) {
  // Tabulator's 'dataFiltered' event fires while it's still computing the
  // new active-rows list, before table.getDataCount('active') reflects it —
  // so use the row array the event itself hands us instead of re-querying.
  const shown = activeRowCount ?? table.getDataCount('active');
  const total = table.getDataCount();
  resultCountEl.textContent =
    shown === total ? `Showing all ${total} issues.` : `Showing ${shown} of ${total} issues.`;
}

table.on('tableBuilt', () => {
  table.redraw(true);
  updateSortSummary();
  updateResultCount();
});
table.on('dataSorted', updateSortSummary);
table.on('dataFiltered', (_filters, rows) => updateResultCount(rows.length));

// Every full re-render (sort, or our own redraw(true) calls for expand
// toggles) resets the table's scroll container to (0, 0) — Tabulator's
// "basic" vertical renderer clears and rebuilds all row DOM on each render.
// Save/restore scroll position around those points so the view doesn't jump.
const tableEl = document.querySelector<HTMLDivElement>('#table')!;

function scrollHolder(): HTMLElement | null {
  return tableEl.querySelector<HTMLElement>('.tabulator-tableholder');
}

let savedScrollTop = 0;
let savedScrollLeft = 0;

function saveScroll() {
  const holder = scrollHolder();
  if (holder) {
    savedScrollTop = holder.scrollTop;
    savedScrollLeft = holder.scrollLeft;
  }
}

function restoreScroll() {
  const holder = scrollHolder();
  if (holder) {
    holder.scrollTop = savedScrollTop;
    holder.scrollLeft = savedScrollLeft;
  }
}

function redrawPreservingScroll() {
  saveScroll();
  table.redraw(true);
  // A synchronous restore loses the race with Tabulator's own post-render
  // layout pass (same reason the sort restore needs this); a frame later
  // it sticks.
  requestAnimationFrame(restoreScroll);
}

// Capture phase so this runs before Tabulator's own header click handler
// (bound on the header cell itself) triggers the sort and resets scroll.
tableEl.addEventListener(
  'click',
  (e) => {
    if ((e.target as HTMLElement).closest('.tabulator-col-title-holder')) {
      saveScroll();
    }
  },
  true,
);
table.on('dataSorted', () => {
  // A plain synchronous restore loses the race with Tabulator's own
  // post-sort layout pass; giving it a frame first makes it stick.
  requestAnimationFrame(restoreScroll);
});

const searchInput = document.querySelector<HTMLInputElement>('#search')!;
const statusSelect = document.querySelector<HTMLSelectElement>('#filter-status')!;
const labelToggle = document.querySelector<HTMLButtonElement>('#label-filter-toggle')!;
const labelMenu = document.querySelector<HTMLDivElement>('#label-filter-menu')!;
const labelCheckboxes = Array.from(
  labelMenu.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
);

function selectedLabels(): string[] {
  return labelCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value);
}

function updateLabelToggleText() {
  const n = selectedLabels().length;
  labelToggle.textContent = n === 0 ? 'Labels' : `Labels (${n})`;
}

labelToggle.addEventListener('click', () => {
  labelMenu.hidden = !labelMenu.hidden;
  labelToggle.setAttribute('aria-expanded', String(!labelMenu.hidden));
});

document.addEventListener('click', (e) => {
  if (!labelMenu.hidden && !labelMenu.contains(e.target as Node) && e.target !== labelToggle) {
    labelMenu.hidden = true;
    labelToggle.setAttribute('aria-expanded', 'false');
  }
});

labelMenu.addEventListener('change', () => {
  updateLabelToggleText();
  applyFilters();
});

function applyFilters() {
  const term = searchInput.value.trim().toLowerCase();
  const status = statusSelect.value;
  const labels = selectedLabels();
  if (!term && !status && labels.length === 0) {
    table.clearFilter(false);
    return;
  }
  table.setFilter((row: Row) => {
    if (status && row.project_status !== status) return false;
    if (labels.length > 0 && !labels.every((l) => row.labels.includes(l))) return false;
    if (!term) return true;
    return (
      row.title.toLowerCase().includes(term) ||
      (row.description ?? '').toLowerCase().includes(term) ||
      String(row.number).includes(term)
    );
  });
}

searchInput.addEventListener('input', applyFilters);
statusSelect.addEventListener('change', applyFilters);

document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
  searchInput.value = '';
  statusSelect.value = '';
  labelCheckboxes.forEach((cb) => (cb.checked = false));
  updateLabelToggleText();
  labelMenu.hidden = true;
  labelToggle.setAttribute('aria-expanded', 'false');
  table.clearFilter(true);
  table.clearHeaderFilter();
  table.setHeaderFilterValue('state', 'open');
});

const shareButton = document.querySelector<HTMLButtonElement>('#share')!;
shareButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    const original = shareButton.textContent;
    shareButton.textContent = 'Copied!';
    setTimeout(() => {
      shareButton.textContent = original;
    }, 1500);
  } catch {
    // Clipboard API needs a secure context and can be denied by the
    // browser; the URL is still visible in the address bar either way.
  }
});

// Clicking a label chip, or the expand/collapse toggles inside a card,
// re-renders via redraw(true) so the formatters (which read expandedDetails /
// expandedCommenters) pick up the new state.
tableEl.addEventListener('click', (e) => {
  const actionEl = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const number = actionEl.dataset.number ? Number(actionEl.dataset.number) : null;

  if (action === 'toggle-details' && number !== null) {
    if (expandedDetails.has(number)) expandedDetails.delete(number);
    else expandedDetails.add(number);
    redrawPreservingScroll();
  } else if (action === 'toggle-commenters' && number !== null) {
    if (expandedCommenters.has(number)) expandedCommenters.delete(number);
    else expandedCommenters.add(number);
    redrawPreservingScroll();
  } else if (action === 'filter-label') {
    const label = actionEl.dataset.label!;
    const checkbox = labelCheckboxes.find((cb) => cb.value === label);
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      updateLabelToggleText();
      applyFilters();
      // Chips re-render their active/inactive state from selectedLabels(),
      // which only happens on a full redraw. The row set just changed
      // anyway (like any other filter action), so no need to preserve scroll.
      table.redraw(true);
    }
  }
});

// Reflect the current search/status/label/state filters and sort in the URL
// (debounced, so a burst of changes collapses into one history entry) so the
// browser back/forward buttons step through filter history.
let isApplyingFromUrl = false;
let urlSyncTimer: number | undefined;

function buildParamsFromState(): URLSearchParams {
  const params = new URLSearchParams();
  const q = searchInput.value.trim();
  if (q) params.set('q', q);
  const status = statusSelect.value;
  if (status) params.set('status', status);
  for (const l of selectedLabels()) params.append('label', l);
  params.set('state', (table.getHeaderFilterValue('state') as string | undefined) || '');
  params.set('sort', serializeSort(table.getSorters()));
  return params;
}

let initialUrlSyncDone = false;

function scheduleUrlSync() {
  if (isApplyingFromUrl) return;
  if (urlSyncTimer !== undefined) window.clearTimeout(urlSyncTimer);
  urlSyncTimer = window.setTimeout(() => {
    urlSyncTimer = undefined;
    const newSearch = `?${buildParamsFromState().toString()}`;
    if (newSearch !== location.search) {
      // The very first sync just resolves defaults (e.g. state=open) that
      // weren't in the URL yet — replace rather than pushing a history entry
      // for a view the user didn't actually navigate to.
      if (initialUrlSyncDone) {
        history.pushState(null, '', newSearch);
      } else {
        history.replaceState(null, '', newSearch);
      }
    }
    initialUrlSyncDone = true;
  }, 300);
}

function applyStateFromUrl() {
  isApplyingFromUrl = true;
  try {
    const s = readUrlState();
    searchInput.value = s.q;
    statusSelect.value = s.status;
    labelCheckboxes.forEach((cb) => (cb.checked = s.labels.includes(cb.value)));
    updateLabelToggleText();
    table.setHeaderFilterValue('state', s.state);
    table.setSort(s.sort.length ? s.sort : DEFAULT_SORT);
    applyFilters();
  } finally {
    isApplyingFromUrl = false;
  }
}

table.on('dataFiltered', scheduleUrlSync);
table.on('dataSorted', scheduleUrlSync);
window.addEventListener('popstate', applyStateFromUrl);
