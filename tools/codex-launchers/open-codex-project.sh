#!/bin/zsh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
TARGETS_FILE="$DIR/targets.tsv"
HELPER="$DIR/launch-codex.sh"

if [[ ! -f "$TARGETS_FILE" ]]; then
  print -u2 "targets file missing: $TARGETS_FILE"
  exit 1
fi

typeset -a LABELS
typeset -a PATHS
typeset -a PURPOSES

index=1
while IFS=$'\t' read -r key label path purpose; do
  [[ -z "${key}" ]] && continue
  [[ "${key}" == \#* ]] && continue
  [[ ! -d "${path}" ]] && continue
  LABELS[$index]="${label}"
  PATHS[$index]="${path}"
  PURPOSES[$index]="${purpose}"
  print "${index}) ${label}"
  print "   ${purpose}"
  ((index++))
done < "$TARGETS_FILE"

if (( index == 1 )); then
  print -u2 "no launchable targets found"
  exit 1
fi

print
vared -p "Select project number: " -c choice

if [[ -z "${choice}" || ! "${choice}" =~ '^[0-9]+$' ]]; then
  print -u2 "invalid selection"
  exit 1
fi

if (( choice < 1 || choice >= index )); then
  print -u2 "selection out of range"
  exit 1
fi

exec "$HELPER" "${PATHS[$choice]}" "${LABELS[$choice]}"
