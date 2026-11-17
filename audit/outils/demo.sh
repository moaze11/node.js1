#!/usr/bin/env bash
# Lance une attaque en direct dans le terminal, pour la capture d'écran.
#
# Usage (depuis le dossier auth-api) :
#   ./audit/outils/demo.sh 002 poc      → attaque sur la version vulnérable (commit ae87776)
#   ./audit/outils/demo.sh 002 retest   → même attaque sur la version corrigée
#
# Le serveur de test tourne en arrière-plan (base vide /tmp/audit.db, port 3099) :
# seule la sortie de l'attaque s'affiche.
set -e
cd "$(dirname "$0")/../.."
N="$1"; KIND="$2"
if [ -z "$N" ] || { [ "$KIND" != poc ] && [ "$KIND" != retest ]; }; then
  echo "Usage : ./audit/outils/demo.sh <001..010> <poc|retest>"; exit 1
fi
SCRIPT=$(ls audit/VULN-$N-*/poc.sh)

SRC=.
if [ "$KIND" = poc ]; then
  # Copie de travail de la version vulnérable, à côté du projet (sans toucher au code actuel)
  SRC=/tmp/auth-api-vulnerable
  if [ ! -d "$SRC" ]; then
    git worktree add --detach "$SRC" ae87776 > /dev/null 2>&1
    ln -s "$PWD/node_modules" "$SRC/node_modules"
    cp .env "$SRC/.env" 2>/dev/null || true
  fi
  mkdir -p "$SRC/audit/outils" && cp audit/outils/start-test-api.sh "$SRC/audit/outils/"
fi

ENVV=""; [ "$N" = 010 ] && ENVV=production
kill $(lsof -ti tcp:3099) 2>/dev/null || true
while lsof -ti tcp:3099 > /dev/null; do sleep 0.3; done   # attendre que l'ancien serveur soit arrêté
NODE_ENV=$ENVV "$SRC/audit/outils/start-test-api.sh" > /tmp/audit-server.log 2>&1 &
curl -s -o /dev/null --retry 60 --retry-connrefused --retry-delay 1 http://localhost:3099/health

clear 2>/dev/null || true
if [ "$KIND" = poc ]; then VERSION="version VULNÉRABLE (commit ae87776)"; else VERSION="version CORRIGÉE"; fi
echo "VULN-$N — $KIND — $VERSION — $(date '+%d/%m/%Y %H:%M')"
[ -n "$ENVV" ] && echo "Serveur lancé avec NODE_ENV=production"
echo "$ ./$SCRIPT"
echo
if [ "$N" = 001 ]; then
  "./$SCRIPT" http://localhost:3099 /tmp/audit.db
else
  "./$SCRIPT"
fi

kill $(lsof -ti tcp:3099) 2>/dev/null || true
