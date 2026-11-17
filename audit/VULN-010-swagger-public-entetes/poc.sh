#!/usr/bin/env bash
# VULN-010 — PoC : en production, la carte complète de l'API est publique et des en-têtes manquent
# Lancer l'API avec : NODE_ENV=production ./audit/outils/start-test-api.sh
source "$(dirname "$0")/../outils/common.sh"

echo "=== 1. Un visiteur anonyme récupère la documentation complète de l'API"
echo "GET /api-docs.json   (aucune authentification)"
DOC=$(curl -s -w "\n%{http_code}" "$BASE/api-docs.json")
echo "HTTP $(echo "$DOC" | tail -1)"
echo "Routes révélées :"
echo "$DOC" | sed '$d' | grep -o '"/[a-z/:{}-]*":' | tr -d '":' | sed 's/^/  /'
echo
echo "GET /api-docs -> HTTP $(status "$BASE/api-docs")"

echo
echo "=== 2. En-têtes de sécurité renvoyés par l'API"
curl -s -D - -o /dev/null "$BASE/health" | grep -iE "^(strict-transport-security|content-security-policy|x-frame-options|x-content-type-options):" || true
echo "Strict-Transport-Security : $(curl -s -D - -o /dev/null "$BASE/health" | grep -ci '^strict-transport-security') occurrence(s)"
echo "Content-Security-Policy   : $(curl -s -D - -o /dev/null "$BASE/health" | grep -ci '^content-security-policy') occurrence(s)"
