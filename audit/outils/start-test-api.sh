#!/usr/bin/env bash
# Démarre une API de test sur une base SQLite VIDE (/tmp/audit.db), port 3099.
# Lancer un serveur neuf avant chaque PoC : les limites de requêtes sont en mémoire.
#
# Usage : ./audit/outils/start-test-api.sh            (depuis le dossier auth-api)
#         NODE_ENV=production ./audit/outils/start-test-api.sh
set -e
cd "$(dirname "$0")/../.."

DB=/tmp/audit.db
rm -f "$DB" "$DB-journal"
DATABASE_URL="file:$DB" npx prisma migrate deploy > /dev/null

# Secrets de test uniquement. RESEND_API_KEY factice : aucun email réel n'est envoyé.
# OPENAI_API_KEY n'est pas surchargée : celle du .env sert au PoC sur le triage IA.
exec env \
  DATABASE_URL="file:$DB" \
  PORT=3099 \
  JWT_SECRET=audit-access-secret-0123456789abcdef0123456789 \
  JWT_REFRESH_SECRET=audit-refresh-secret-0123456789abcdef01234567 \
  SUPERADMIN_BOOTSTRAP_TOKEN=audit-bootstrap-token-0123456789abcdef \
  RESEND_API_KEY=re_audit_dummy \
  npx ts-node src/index.ts
