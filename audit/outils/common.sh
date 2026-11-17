#!/usr/bin/env bash
# Fonctions partagées par les PoC. À sourcer : source "$(dirname "$0")/common.sh"
# Cible : l'API lancée par start-test-api.sh (port 3099, base /tmp/audit.db).

BASE="${BASE:-http://localhost:3099}"
DB="${DB:-/tmp/audit.db}"
BOOTSTRAP_TOKEN=audit-bootstrap-token-0123456789abcdef

# Valeur d'un champ texte dans une réponse JSON : echo "$json" | field accessToken
field() { grep -o "\"$1\":\"[^\"]*\"" | head -1 | cut -d'"' -f4; }

# POST JSON : post <chemin> <corps> [options curl supplémentaires]
post() { local path=$1 body=$2; shift 2; curl -s -X POST "$BASE$path" -H 'Content-Type: application/json' "$@" -d "$body"; }

# Code HTTP seul
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# Tronque les JWT à l'affichage (ils restent complets dans les variables)
short() { sed -E 's/(eyJ[A-Za-z0-9_-]{16})[A-Za-z0-9._-]*/\1.../g'; }

sql() { sqlite3 "$DB" "$1"; }

# Comptes de départ : un SuperAdmin (admin@corp.test) et une utilisatrice (alice@corp.test)
setup_accounts() {
  ADMIN_TOKEN=$(post /auth/super-admin '{"email":"admin@corp.test","password":"AdminPass123!"}' \
    -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN" | field accessToken)
  local user_role
  user_role=$(sql "SELECT id FROM Role WHERE name = 'User';")
  post /admin/users "{\"email\":\"alice@corp.test\",\"password\":\"AlicePass123!\",\"roleId\":$user_role}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
  echo "# Comptes créés : admin@corp.test (SuperAdmin), alice@corp.test (User)"
}
