#!/usr/bin/env bash
# Attaques tentées qui ÉCHOUENT : les protections fonctionnent (pas de fiche VULN).
# Lancer l'API avec : OPENAI_API_KEY= ./audit/outils/start-test-api.sh   (tickets créés sans IA)
source "$(dirname "$0")/../outils/common.sh"
setup_accounts

USER_ROLE=$(sql "SELECT id FROM Role WHERE name = 'User';")
post /admin/users "{\"email\":\"bob@corp.test\",\"password\":\"BobPass123!\",\"roleId\":$USER_ROLE}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
ALICE=$(post /auth/login '{"email":"alice@corp.test","password":"AlicePass123!"}' | field accessToken)
BOB=$(post /auth/login '{"email":"bob@corp.test","password":"BobPass123!"}' | field accessToken)
BOB_TICKET=$(post /tickets '{"title":"Ticket prive de Bob","description":"confidentiel"}' -H "Authorization: Bearer $BOB" \
  | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
ALICE_ID=$(sql "SELECT id FROM User WHERE email = 'alice@corp.test';")

echo "=== T1. IDOR : Alice lit le ticket n°$BOB_TICKET de Bob"
curl -s -w "  -> HTTP %{http_code}\n" "$BASE/tickets/$BOB_TICKET" -H "Authorization: Bearer $ALICE"
curl -s -w "  -> HTTP %{http_code}\n" "$BASE/tickets/$BOB_TICKET/messages" -H "Authorization: Bearer $ALICE"

echo
echo "=== T2. Élévation de privilèges : Alice (User) appelle des routes d'administration"
echo "  GET /admin/users                -> HTTP $(status "$BASE/admin/users" -H "Authorization: Bearer $ALICE")"
echo "  PATCH /admin/users/$ALICE_ID/role (SuperAdmin) -> HTTP $(status -X PATCH "$BASE/admin/users/$ALICE_ID/role" \
  -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"roleId":1}')"
echo "  GET /admin/audit-logs           -> HTTP $(status "$BASE/admin/audit-logs" -H "Authorization: Bearer $ALICE")"

echo
echo "=== T3. Injection SQL dans les paramètres de recherche et de tri"
echo "  GET /tickets?search=' OR 1=1 --  (tickets renvoyés à Alice) :"
curl -s -G "$BASE/tickets" --data-urlencode "search=' OR 1=1 --" -H "Authorization: Bearer $ALICE" \
  -w "  -> HTTP %{http_code}\n" | grep -o '"total":[0-9]*\|HTTP [0-9]*' | sed 's/^/    /'
echo "  GET /tickets?sortBy=password     -> HTTP $(status "$BASE/tickets?sortBy=password" -H "Authorization: Bearer $ALICE")"
echo "  GET /tickets?sortBy=id;DROP TABLE User -> HTTP $(status -G "$BASE/tickets" --data-urlencode 'sortBy=id;DROP TABLE User' -H "Authorization: Bearer $ALICE")"
echo "  Table User toujours présente : $(sql "SELECT count(*) FROM User;") comptes"

echo
echo "=== T4. JWT forgé"
NONE_TOKEN="$(printf '{"alg":"none","typ":"JWT"}' | base64 | tr -d '=' | tr '/+' '_-').$(printf "{\"userId\":1,\"role\":\"SuperAdmin\",\"sid\":1}" | base64 | tr -d '=' | tr '/+' '_-')."
echo "  alg: none, SuperAdmin            -> HTTP $(status "$BASE/admin/users" -H "Authorization: Bearer $NONE_TOKEN")"
FAKE=$(node -e "console.log(require('jsonwebtoken').sign({userId:1,email:'x',role:'SuperAdmin',sid:1},'devine-le-secret-devine-le-secret-1234'))")
echo "  signé avec un autre secret       -> HTTP $(status "$BASE/admin/users" -H "Authorization: Bearer $FAKE")"

echo
echo "=== T5. Champs ajoutés : Alice envoie ownerId=1 (l'admin), status=closed, assigneeId=1"
post /tickets "{\"title\":\"Test assignation\",\"ownerId\":1,\"status\":\"closed\",\"assigneeId\":1}" \
  -H "Authorization: Bearer $ALICE" | grep -o '"ownerId":[0-9]*\|"status":"[a-z_]*"\|"assigneeId":[a-z0-9]*' | sed 's/^/  /'
echo "  (id d'Alice : $ALICE_ID)"

echo
echo "=== T6. Compte désactivé : son token est refusé immédiatement"
ADMIN_ALICE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/admin/users/$ALICE_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"isActive":false}')
echo "  l'admin désactive Alice          -> HTTP $ADMIN_ALICE"
echo "  Alice appelle /user/profile      -> HTTP $(status "$BASE/user/profile" -H "Authorization: Bearer $ALICE")"
