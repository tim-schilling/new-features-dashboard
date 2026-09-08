#!/usr/bin/env python3
"""Generate a YAML report of emoji reactions on issues in a GitHub repo.

Requires the `gh` CLI to be installed and authenticated (`gh auth status`).
Only reactions on the issue body are counted, not on comments.

Usage:
    python scripts/fetch_reactions.py [--repo django/new-features] [--output output/reactions.yaml]
"""
import argparse
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone

import yaml

from _common import check_gh_auth, fetch_issues, parse_jsonl, run_gh

REACTION_DELAY_SECONDS = 0.15


def fetch_reactions_for_issue(repo, number):
    output = run_gh(
        [
            "api",
            f"repos/{repo}/issues/{number}/reactions",
            "--paginate",
            "--jq",
            ".[] | {content, user: .user.login}",
        ]
    )
    return parse_jsonl(output)


def build_report(repo, issues, verbose):
    report_issues = []
    for i, issue in enumerate(issues, start=1):
        if verbose:
            print(
                f"[{i}/{len(issues)}] issue #{issue['number']}: {issue['title'][:60]}",
                file=sys.stderr,
            )
        raw_reactions = fetch_reactions_for_issue(repo, issue["number"])
        grouped = defaultdict(set)
        for r in raw_reactions:
            if r.get("user") is None:
                print(
                    f"  warning: ghost/deleted user on issue #{issue['number']}, skipping",
                    file=sys.stderr,
                )
                continue
            grouped[r["content"]].add(r["user"])
        reactions = {
            content: sorted(users) for content, users in grouped.items() if users
        }
        report_issues.append(
            {
                "number": issue["number"],
                "title": issue["title"],
                "state": issue["state"],
                "url": issue["html_url"],
                "reactions": reactions,
            }
        )
        time.sleep(REACTION_DELAY_SECONDS)
    report_issues.sort(key=lambda i: i["number"])
    return report_issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="django/new-features")
    parser.add_argument("--output", "-o", default="output/reactions.yaml")
    parser.add_argument("--state", default="all", choices=["all", "open", "closed"])
    parser.add_argument(
        "--limit", type=int, default=None, help="Only process the first N issues"
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    check_gh_auth()
    issues = fetch_issues(args.repo, args.state, args.limit, args.verbose)
    report_issues = build_report(args.repo, issues, args.verbose)

    report = {
        "repo": args.repo,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "issues": report_issues,
    }

    with open(args.output, "w") as f:
        yaml.safe_dump(report, f, allow_unicode=True, sort_keys=False)

    print(f"Wrote {len(report_issues)} issues to {args.output}")


if __name__ == "__main__":
    main()
