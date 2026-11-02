#!/usr/bin/env bash
set -euo pipefail

# Use lighter PR checks only for non-empty diffs within the allowed docs paths.
# Benchmark measurements are manual; this allowlist controls correctness and packaging checks.
diff_file=$(mktemp "$RUNNER_TEMP/fast-link-paths.XXXXXX")
trap 'rm -f "$diff_file"' EXIT
git diff --name-status -z --find-renames "$PR_BASE...$PR_HEAD" > "$diff_file"

allowed_path() {
  [[ "$1" == docs/*.md ]] ||
    [[ "$1" == *.md && "$1" != */* ]]
}

changed=0
lightweight=true
while IFS= read -r -d '' status && IFS= read -r -d '' path; do
  changed=1
  if ! allowed_path "$path"; then lightweight=false; fi
  if [[ "$status" == R* || "$status" == C* ]]; then
    IFS= read -r -d '' destination
    if ! allowed_path "$destination"; then lightweight=false; fi
  fi
done < "$diff_file"

if [[ "$changed" == 0 ]]; then lightweight=false; fi
echo "lightweight=$lightweight" >> "$GITHUB_OUTPUT"
