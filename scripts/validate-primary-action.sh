#!/usr/bin/env bash
# Validates UX-19: Each page/route has at most one primary-action-colored element.
# Counts distinct bg-primary action types per page file.
#
# Note: Repeated CTA buttons with the same label at different scroll positions
# count as ONE action type, not multiple.
#
# Usage: ./scripts/validate-primary-action.sh
# Exit 0 = no violations, Exit 1 = violations found

set -euo pipefail

HAS_ERROR=0

check_file() {
  local file="$1"

  # Count bg-primary usages (CTA buttons)
  local bg_count
  bg_count=$(grep -c 'bg-primary' "$file" 2>/dev/null || true)

  if [ "$bg_count" -gt 0 ]; then
    # Extract unique href targets for bg-primary elements
    local unique_targets
    unique_targets=$(grep -B2 -A2 'bg-primary' "$file" 2>/dev/null | { grep -oE 'href="[^"]*"' || true; } | sort -u | wc -l | tr -d ' ')
    unique_targets=${unique_targets:-0}

    # If more than 1 distinct href target uses bg-primary, that's a violation
    if [ "$unique_targets" -gt 1 ]; then
      echo "VIOLATION: $file has $unique_targets distinct primary actions via bg-primary (max 1 allowed)"
      HAS_ERROR=1
    fi
  fi

  # Count text-primary usages (green text that is NOT text-primary-foreground)
  # text-primary-foreground is the text ON a CTA button — that's allowed
  # Exclude Tailwind state prefixes (hover:, focus:, etc.) — only static green counts
  local text_primary_matches
  text_primary_matches=$(grep -oE '[a-z:-]*text-primary[a-z-]*' "$file" 2>/dev/null | grep -v 'text-primary-foreground' | grep -cvE '^(hover|focus|focus-visible|active|group-hover):' || true)
  text_primary_matches=${text_primary_matches:-0}

  if [ "$text_primary_matches" -gt 0 ]; then
    echo "VIOLATION: $file has $text_primary_matches text-primary usage(s) — green text outside CTA buttons"
    HAS_ERROR=1
  fi
}

# Scan Astro page files
while IFS= read -r file; do
  check_file "$file"
done < <(find apps/website/src/pages -name "*.astro" 2>/dev/null || true)

# Scan React route components
while IFS= read -r file; do
  case "$file" in
    */node_modules/*) continue ;;
  esac
  check_file "$file"
done < <(find apps/webapp/src -name "*.tsx" \( -path "*/routes/*" -o -path "*/pages/*" \) 2>/dev/null || true)

if [ "$HAS_ERROR" -eq 1 ]; then
  echo ""
  echo "Each page/route should have at most one primary-action type (green CTA)."
  echo "Repeated instances of the SAME CTA at different scroll positions are OK."
  exit 1
fi

echo "Primary action validation passed."
exit 0
