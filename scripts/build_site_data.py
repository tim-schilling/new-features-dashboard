#!/usr/bin/env python3
"""Merge output/reactions.yaml and output/issue_details.yaml into the single
JSON file the static site (site/) reads at build time.

Usage:
    python scripts/build_site_data.py [--reactions output/reactions.yaml] [--details output/issue_details.yaml] [--output site/src/data/issues.json]
"""
import argparse
import json
import sys
from datetime import datetime, timezone

import yaml

# Defensive re-filter: issue_details.yaml may predate this exclusion (it's
# cached and only refreshed by re-running fetch_issue_details.py), so drop
# bot comments here too rather than requiring a re-fetch to fix counts.
EXCLUDED_COMMENT_AUTHORS = {"github-actions"}


def load_yaml(path):
    with open(path) as f:
        return yaml.safe_load(f)


def merge(reactions_report, details_report):
    details_by_number = {i["number"]: i for i in details_report["issues"]}
    reactions_numbers = {i["number"] for i in reactions_report["issues"]}
    merged = []
    for issue in reactions_report["issues"]:
        number = issue["number"]
        detail = details_by_number.get(number, {})
        reactions = issue.get("reactions", {})
        reaction_counts = {content: len(users) for content, users in reactions.items()}
        comments_by_user = {
            user: count
            for user, count in detail.get("comments_by_user", {}).items()
            if user not in EXCLUDED_COMMENT_AUTHORS
        }
        merged.append(
            {
                "number": number,
                "title": issue["title"],
                "url": issue["url"],
                "state": issue["state"],
                "project_status": detail.get("project_status"),
                "labels": detail.get("labels", []),
                "reactions": reaction_counts,
                "reactions_users": reactions,
                "total_reactions": sum(reaction_counts.values()),
                "comments_by_user": comments_by_user,
                "total_comments": sum(comments_by_user.values()),
                "description": detail.get("description"),
            }
        )

    missing = set(details_by_number) - reactions_numbers
    if missing:
        print(
            f"warning: {len(missing)} issue(s) in issue_details.yaml have no "
            f"matching entry in reactions.yaml: {sorted(missing)}",
            file=sys.stderr,
        )
    merged.sort(key=lambda i: i["number"])
    return merged


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reactions", default="output/reactions.yaml")
    parser.add_argument("--details", default="output/issue_details.yaml")
    parser.add_argument("--output", "-o", default="site/src/data/issues.json")
    args = parser.parse_args()

    reactions_report = load_yaml(args.reactions)
    details_report = load_yaml(args.details)
    merged = merge(reactions_report, details_report)

    payload = {
        "repo": reactions_report["repo"],
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "issues": merged,
    }

    with open(args.output, "w") as f:
        json.dump(payload, f, indent=2, sort_keys=False)
        f.write("\n")

    print(f"Wrote {len(merged)} issues to {args.output}")


if __name__ == "__main__":
    main()
