# new-features tooling

Scripts that fetch GitHub issue data into `output/` (gitignored), plus a
static site (`site/`) that turns it into a searchable/filterable/sortable
table, published to GitHub Pages by `.github/workflows/deploy.yml`.

## `scripts/fetch_reactions.py`

Emoji reactions on every issue body (not comments) in a GitHub repo, grouped
per issue.

```
uv run python scripts/fetch_reactions.py --repo django/new-features -v
```

Flags: `--repo`, `--output`/`-o`, `--state {all,open,closed}`, `--limit N`, `-v`.

## `scripts/fetch_issue_details.py`

Labels, per-commenter comment counts, and the GitHub Projects (v2) "Status"
field for every issue in a GitHub repo (via GraphQL).

```
uv run python scripts/fetch_issue_details.py --repo django/new-features --project-number 24 -v
```

Flags: `--repo`, `--project-number` (default `24`, the "New Features" project),
`--output`/`-o`, `--state {all,open,closed}`, `--limit N`, `-v`.

## `scripts/build_site_data.py`

Merges `output/reactions.yaml` and `output/issue_details.yaml` into
`site/src/data/issues.json`, the single data file the static site reads.

```
uv run python scripts/build_site_data.py
```

## `site/`

A Vite + TypeScript static site using [Tabulator](https://tabulator.info/)
for the searchable/filterable/sortable issue table. Local dev:

```
cd site
npm install
npm run build   # or `npm run dev` for hot reload against whatever is in src/data/issues.json
npm test        # Playwright smoke tests (spins up its own preview server)
```

`site/src/data/issues.json` is gitignored — generate it locally with the
scripts above before running `dev`/`build`/`test`.

## Contributing

`just --list` shows all commands (`just sync`, `just auth-project`,
`just pipeline`, `just site-install`, `just site-dev`, `just site-test`, etc.).

Prerequisites: `gh auth login`, then `just auth-project` for the
`read:project` scope `fetch-details` needs.

Deploys via `.github/workflows/deploy.yml` to GitHub Pages
(https://tim-schilling.github.io/new-features-dashboard/) — requires a
`PROJECTS_TOKEN` repo secret and Pages source set to "GitHub Actions".

`PROJECTS_TOKEN` should be a **fine-grained** PAT, scoped to just this repo,
with:
- Repository access: `django/new-features` only
- Repository permissions: `Issues: Read-only` (also covers reactions)
- Organization permissions: `Projects: Read-only` (needed since the "New
  Features" project is org-owned; the django org must have fine-grained PAT
  access enabled/approved for this to take effect)

A classic PAT with `repo` + `read:project` scopes also works but is
overprivileged (full read/write repo access) for what this pipeline needs —
prefer the fine-grained token above.
