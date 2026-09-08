#!/usr/bin/env python3
"""Generate a YAML report of labels, per-commenter comment counts, and
GitHub Projects (v2) status for every issue in a GitHub repo.

Requires the `gh` CLI, authenticated (`gh auth status`), with a token that
also has the `read:project` scope (needed to read Projects v2 status; run
`gh auth refresh -s read:project` if you see INSUFFICIENT_SCOPES errors).

Usage:
    python scripts/fetch_issue_details.py [--repo django/new-features] [--project-number 24] [--output output/issue_details.yaml]
"""
import argparse
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone

import yaml

from _common import check_gh_auth, fetch_issues, run_gh_graphql

REQUEST_DELAY_SECONDS = 0.15
EXCLUDED_COMMENT_AUTHORS = {"github-actions"}

ISSUE_DETAIL_QUERY = """
query($owner: String!, $name: String!, $number: Int!, $commentsAfter: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      body
      labels(first: 20) {
        nodes { name }
      }
      projectItems(first: 10) {
        nodes {
          project { number }
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
        }
      }
      comments(first: 100, after: $commentsAfter) {
        pageInfo { hasNextPage endCursor }
        nodes { author { login } }
      }
    }
  }
}
"""


def fetch_issue_detail(owner, name, number, project_number, verbose):
    labels = []
    project_status = None
    description = None
    comment_authors = []
    cursor = None
    page = 0
    while True:
        page += 1
        variables = {"owner": owner, "name": name, "number": number}
        if cursor:
            variables["commentsAfter"] = cursor
        data = run_gh_graphql(ISSUE_DETAIL_QUERY, variables)
        issue = data["data"]["repository"]["issue"]
        if page == 1:
            description = issue.get("body") or None
            labels = [l["name"] for l in issue["labels"]["nodes"]]
            for item in issue["projectItems"]["nodes"]:
                if item["project"]["number"] == project_number:
                    field_value = item.get("fieldValueByName")
                    project_status = field_value["name"] if field_value else None
                    break
        for c in issue["comments"]["nodes"]:
            author = c["author"]
            login = author["login"] if author else None
            if login in EXCLUDED_COMMENT_AUTHORS:
                continue
            comment_authors.append(login)
        page_info = issue["comments"]["pageInfo"]
        if not page_info["hasNextPage"]:
            break
        cursor = page_info["endCursor"]
        time.sleep(REQUEST_DELAY_SECONDS)

    ghost_count = comment_authors.count(None)
    if ghost_count and verbose:
        print(
            f"  warning: {ghost_count} comment(s) by ghost/deleted users on "
            f"issue #{number}, excluded from counts",
            file=sys.stderr,
        )
    counts = Counter(a for a in comment_authors if a is not None)
    comments_by_user = dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))

    return labels, project_status, comments_by_user, description


def build_report(repo, issues, project_number, verbose):
    owner, name = repo.split("/", 1)
    report_issues = []
    for i, issue in enumerate(issues, start=1):
        if verbose:
            print(
                f"[{i}/{len(issues)}] issue #{issue['number']}: {issue['title'][:60]}",
                file=sys.stderr,
            )
        labels, project_status, comments_by_user, description = fetch_issue_detail(
            owner, name, issue["number"], project_number, verbose
        )
        report_issues.append(
            {
                "number": issue["number"],
                "labels": labels,
                "project_status": project_status,
                "comments_by_user": comments_by_user,
                "description": description,
            }
        )
        time.sleep(REQUEST_DELAY_SECONDS)
    report_issues.sort(key=lambda i: i["number"])
    return report_issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="django/new-features")
    parser.add_argument(
        "--project-number",
        type=int,
        default=24,
        help="GitHub Projects (v2) project number to read Status from",
    )
    parser.add_argument("--output", "-o", default="output/issue_details.yaml")
    parser.add_argument("--state", default="all", choices=["all", "open", "closed"])
    parser.add_argument(
        "--limit", type=int, default=None, help="Only process the first N issues"
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    check_gh_auth()
    issues = fetch_issues(args.repo, args.state, args.limit, args.verbose)
    report_issues = build_report(args.repo, issues, args.project_number, args.verbose)

    report = {
        "repo": args.repo,
        "project_number": args.project_number,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "issues": report_issues,
    }

    output_dir = os.path.dirname(args.output)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(args.output, "w") as f:
        yaml.safe_dump(report, f, allow_unicode=True, sort_keys=False)

    print(f"Wrote {len(report_issues)} issues to {args.output}")


if __name__ == "__main__":
    main()
