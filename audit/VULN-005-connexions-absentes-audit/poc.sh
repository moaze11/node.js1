#!/usr/bin/env bash
# VULN-005 — PoC : connexions, échecs, déconnexions et resets absents du journal d'audit
source "$(dirname "$0")/../outils/common.sh"
setup_accounts

echo "=== 1. Un attaquant tente 4 mots de passe sur le compte d'Alice"
for pw in password 123456 alice2026 Azerty123; do
  post /auth/login "{\"email\":\"alice@corp.test\",\"password\":\"$pw\"}" -o /dev/null -w "login $pw -> HTTP %{http_code}\n"
done

echo
echo "=== 2. Alice se connecte, puis se déconnecte"
REFRESH=$(post /auth/login '{"email":"alice@corp.test","password":"AlicePass123!"}' | field refreshToken)
post /auth/logout "{\"refreshToken\":\"$REFRESH\"}" -o /dev/null -w "logout -> HTTP %{http_code}\n"

echo
echo "=== 3. L'admin consulte le journal d'audit"
echo "GET /admin/audit-logs"
curl -s "$BASE/admin/audit-logs" -H "Authorization: Bearer $ADMIN_TOKEN" | grep -o '"action":"[A-Z_]*"'
echo
echo "\$ sqlite3 audit.db \"SELECT action, count(*) FROM AuditLog GROUP BY action;\""
sql "SELECT action, count(*) FROM AuditLog GROUP BY action;"
