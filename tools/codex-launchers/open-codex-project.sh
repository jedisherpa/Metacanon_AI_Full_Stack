#!/bin/zsh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
HELPER="$DIR/launch-codex.sh"
ACTIVE_FILE="$DIR/targets.tsv"
DOMAIN_FILE="$DIR/targets-domains.tsv"
LOCAL_ONLY_FILE="$DIR/targets-local-only.tsv"

select_from_file() {
  local targets_file="$1"
  local title="$2"

  if [[ ! -f "$targets_file" ]]; then
    print -u2 "targets file missing: $targets_file"
    exit 1
  fi

  local -a labels
  local -a paths
  local -a purposes

  local index=1
  local key label path purpose choice

  print
  print "== ${title} =="
  print

  while IFS=$'\t' read -r key label path purpose; do
    [[ -z "${key}" ]] && continue
    [[ "${key}" == \#* ]] && continue
    [[ ! -d "${path}" ]] && continue
    labels[$index]="${label}"
    paths[$index]="${path}"
    purposes[$index]="${purpose}"
    print "${index}) ${label}"
    print "   ${purpose}"
    ((index++))
  done < "$targets_file"

  if (( index == 1 )); then
    print -u2 "no launchable targets found in ${title}"
    return 1
  fi

  print
  read -r "choice?Select target number or b to go back: "

  if [[ -z "${choice}" ]]; then
    print -u2 "invalid selection"
    return 1
  fi

  if [[ "${choice:l}" == "b" ]]; then
    return 0
  fi

  if [[ ! "${choice}" =~ '^[0-9]+$' ]]; then
    print -u2 "invalid selection"
    return 1
  fi

  if (( choice < 1 || choice >= index )); then
    print -u2 "selection out of range"
    return 1
  fi

  exec "$HELPER" "${paths[$choice]}" "${labels[$choice]}"
}

while true; do
  local_choice=""
  print
  print "== Codex Project Picker =="
  print
  print "1) Active Worktrees"
  print "   Current repo and worktree lanes"
  print "2) Linked Domains"
  print "   The 39 linked domain lines routed to their best local seats"
  print "3) Local-Only / Non-Vercel Projects"
  print "   Projects that live here and are not currently routed through Vercel"
  print "q) Quit"
  print
  read -r "local_choice?Select menu number: "

  case "${local_choice:l}" in
    1)
      select_from_file "$ACTIVE_FILE" "Active Worktrees"
      ;;
    2)
      select_from_file "$DOMAIN_FILE" "Linked Domains"
      ;;
    3)
      select_from_file "$LOCAL_ONLY_FILE" "Local-Only / Non-Vercel Projects"
      ;;
    q)
      exit 0
      ;;
    *)
      print -u2 "invalid selection"
      ;;
  esac
done
