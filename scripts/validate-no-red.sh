#!/usr/bin/env bash
# Validates that no raw red color values are used across the codebase.
# Allowed: --color-destructive token (semantic usage).
# Denied: text-red-*, bg-red-*, border-red-*, raw hex/rgb/hsl/oklch red values.
#
# Usage: ./scripts/validate-no-red.sh [file-or-directory]
# Exit 0 = no violations, Exit 1 = violations found

set -euo pipefail

SEARCH_DIR="${1:-.}"

# Patterns to detect red color usage
RED_PATTERNS=(
  'text-red-'
  'bg-red-'
  'border-red-'
  'ring-red-'
  'outline-red-'
  '#[Ff][Ff]0000'
  '#[Ff]00'
  'rgb[(]255[, ]+0[, ]+0'
  'hsl[(]0[, ]'
  'color:[[:space:]]*red'
  'oklch[(][^)]*[[:space:]]0[)]'
  'oklch[(][^)]*[[:space:]]0[[:space:]]'
)

# Build grep pattern
PATTERN=""
for p in "${RED_PATTERNS[@]}"; do
  if [ -z "$PATTERN" ]; then
    PATTERN="$p"
  else
    PATTERN="$PATTERN|$p"
  fi
done

# File extensions to scan
EXTENSIONS="ts,tsx,astro,css,html,jsx"

VIOLATIONS=""

while IFS= read -r -d '' file; do
  # Skip node_modules, dist, .next, build artifacts
  case "$file" in
    */node_modules/*|*/dist/*|*/.next/*|*/build/*|*/.astro/*) continue ;;
  esac

  # Check for violations, excluding --color-destructive token usage
  matches=$(grep -nE "$PATTERN" "$file" 2>/dev/null | grep -v -- '--color-destructive' || true)
  if [ -n "$matches" ]; then
    VIOLATIONS="${VIOLATIONS}\n${file}:\n${matches}\n"
  fi
done < <(find "$SEARCH_DIR" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.astro" -o -name "*.css" -o -name "*.html" -o -name "*.jsx" \) -not -name "validate-no-red.sh" -print0)

if [ -n "$VIOLATIONS" ]; then
  echo "ERROR: Red color violations found (UX-19):"
  echo -e "$VIOLATIONS"
  echo ""
  echo "Use semantic tokens (e.g., --color-destructive) instead of raw red values."
  exit 1
fi

echo "No red color violations found."
exit 0
