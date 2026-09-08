default:
    @just --list

# Install Python deps
sync:
    uv sync

# Add the read:project gh scope needed by fetch-details
auth-project:
    gh auth refresh -s read:project

# Fetch emoji reactions
fetch-reactions *ARGS:
    uv run python scripts/fetch_reactions.py {{ARGS}}

# Fetch labels, comment counts, and project status
fetch-details *ARGS:
    uv run python scripts/fetch_issue_details.py {{ARGS}}

# Merge fetched YAML into site/src/data/issues.json
build-data:
    uv run python scripts/build_site_data.py

# Run the full fetch -> merge pipeline
pipeline: fetch-reactions fetch-details build-data

# Install site dependencies (npm + Playwright browser)
site-install:
    cd site && npm install && npx playwright install --with-deps chromium

# Vite dev server with hot reload
site-dev:
    cd site && npm run dev

# Production build
site-build:
    cd site && npm run build

# Playwright smoke tests
site-test:
    cd site && npm test
