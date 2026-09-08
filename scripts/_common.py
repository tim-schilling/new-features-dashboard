"""Shared gh CLI helpers used by the fetch_*.py scripts."""
import json
import subprocess
import sys


def run_gh(args):
    result = subprocess.run(
        ["gh"] + args, capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"gh {' '.join(args)} failed (exit {result.returncode}):\n{result.stderr}"
        )
    return result.stdout


def parse_jsonl(output):
    return [json.loads(line) for line in output.splitlines() if line.strip()]


def check_gh_auth():
    result = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            "gh is not authenticated. Run `gh auth login` and try again.\n"
            f"{result.stderr}"
        )


def fetch_issues(repo, state, limit, verbose):
    if verbose:
        print(f"Fetching issues for {repo} (state={state})...", file=sys.stderr)
    output = run_gh(
        [
            "api",
            f"repos/{repo}/issues",
            "--paginate",
            "--method",
            "GET",
            "-f",
            f"state={state}",
            "-f",
            "per_page=100",
            "--jq",
            ".[] | select(.pull_request == null) | {number, title, state, html_url}",
        ]
    )
    issues = parse_jsonl(output)
    issues.sort(key=lambda i: i["number"])
    if limit:
        issues = issues[:limit]
    if verbose:
        print(f"Found {len(issues)} issues (PRs excluded).", file=sys.stderr)
    return issues


def run_gh_graphql(query, variables):
    args = ["api", "graphql", "-f", f"query={query}"]
    for key, value in variables.items():
        if value is None:
            continue
        flag = "-F" if isinstance(value, int) and not isinstance(value, bool) else "-f"
        args += [flag, f"{key}={value}"]
    output = run_gh(args)
    return json.loads(output)
