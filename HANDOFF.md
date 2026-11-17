# HANDOFF — Reprendre le projet

Vue d'ensemble, endpoints et architecture : voir **README.md**. Ce fichier donne la mise en route
et un scénario de test complet, étape par étape.

## Mise en route

```bash
nvm use 20                   # obligatoire : Prisma ne fonctionne pas sous Node 26
npm ci
cp .env.example .env         # remplir JWT_SECRET, JWT_REFRESH_SECRET (openssl rand -hex 32),
                             # RESEND_API_KEY, OPENAI_API_KEY
npx prisma migrate deploy
npm run dev                  # http://localhost:3002 — Swagger : /api-docs
```

Vérifier : `npm test` doit afficher 139 tests réussis.

## Scénario complet (curl)

### 1. Créer le SuperAdmin (une seule fois, base vide)

Mettre d'abord un secret dans `.env` : `SUPERADMIN_BOOTSTRAP_TOKEN=<openssl rand -hex 32>`, puis :

```bash
curl -X POST http://localhost:3002/auth/super-admin \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: <le secret du .env>" \
  -d '{"email": "admin@example.com", "password": "SecurePass123"}'
```

Sans secret configuré, ou avec un mauvais secret : `403`. Refusé aussi si un SuperAdmin existe
déjà. Une fois le SuperAdmin créé, retirer `SUPERADMIN_BOOTSTRAP_TOKEN` du `.env`
(voir [audit/VULN-001](audit/VULN-001-bootstrap-superadmin.md)).

### 2. Se connecter

```bash
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "SecurePass123"}'
```

Réponse : `accessToken` (15 min), `refreshToken` (7 jours), `user`. Garder le token :
`ADMIN_TOKEN="eyJ..."`

### 3. Créer un compte directement (SuperAdmin)

```bash
curl -X POST http://localhost:3002/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"email": "agent@example.com", "password": "SecurePass123", "roleId": 3}'
```

`roleId` : voir `GET /user/roles` (SuperAdmin, Admin, Agent, User). Mot de passe : 8 caractères minimum.

### 4. Inviter quelqu'un (Admin ou SuperAdmin)

```bash
curl -X POST http://localhost:3002/auth/invite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"email": "client@example.com"}'
```

Le token d'invitation part **uniquement par email** (il n'est pas dans la réponse, par sécurité).
En dev, avec une clé Resend de test, l'email n'arrive qu'à l'adresse du compte Resend : récupérer le token
dans la table `Invitation` avec `npx prisma studio`. Puis :

```bash
curl -X POST http://localhost:3002/auth/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{"token": "<token>", "password": "ClientPass123"}'
```

### 5. Créer un ticket (déclenche le triage IA)

```bash
curl -X POST http://localhost:3002/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -d '{"title": "Impossible de me connecter", "description": "Erreur 500 au login"}'
```

Réponse : le ticket (statut, priorité, catégorie fixés par l'IA) et `aiReply` (la réponse de l'IA,
ou `null` si l'IA est indisponible).

### 6. Suivre et répondre

```bash
# Lister ses tickets (filtres, tri, pagination)
curl "http://localhost:3002/tickets?status=open&sortBy=createdAt&order=desc&page=1&limit=20" \
  -H "Authorization: Bearer $CLIENT_TOKEN"

# Lire le fil d'un ticket
curl http://localhost:3002/tickets/1/messages -H "Authorization: Bearer $CLIENT_TOKEN"

# Répondre (rouvre le ticket s'il était fermé)
curl -X POST http://localhost:3002/tickets/1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -d '{"content": "Toujours bloqué"}'
```

### 7. Côté agent

```bash
# S'assigner le ticket et le passer en cours
curl -X PATCH http://localhost:3002/tickets/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d '{"assigneeId": <id de l agent>, "status": "in_progress"}'
```

### 8. Mot de passe oublié

```bash
curl -X POST http://localhost:3002/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "client@example.com"}'
# token reçu par email (ou table PasswordReset dans prisma studio), valable 1 h, une seule fois :
curl -X POST http://localhost:3002/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "<token>", "password": "NewPass456!"}'
```

### 9. Administration

```bash
# Changer un rôle (audité)
curl -X PATCH http://localhost:3002/admin/users/3/role \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"roleId": 2}'

# Désactiver un compte (audité, sessions coupées immédiatement)
curl -X PATCH http://localhost:3002/admin/users/3/status \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"isActive": false}'

# Lire les audit logs
curl "http://localhost:3002/admin/audit-logs?action=ROLE_ASSIGNED" -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Erreurs courantes

| Erreur | Cause | Solution |
|---|---|---|
| `getPlatformInfo is not a function` (Prisma) | Node 26 / npm 11 | `nvm use 20`, puis `rm -rf node_modules && npm ci` |
| `JWT_SECRET must be set and at least 32 characters long` | Secret absent ou trop court | Le générer : `openssl rand -hex 32` |
| 401 `Account disabled or not found` | Compte désactivé ou supprimé | Le réactiver (SuperAdmin) |
| 403 | Rôle insuffisant | Utiliser un compte avec le bon rôle |
| 404 sur un ticket qui existe | Ticket d'un autre utilisateur | Normal : son existence n'est pas révélée |
| 429 | Trop de requêtes (rate limit) | Attendre la fin de la fenêtre (en-tête `Retry-After`) |
| Port 3002 occupé | Autre process | `lsof -i :3002` puis `kill <PID>` |

## Limites connues

- Rate limit en mémoire : remis à zéro au redémarrage, non partagé entre plusieurs instances (Redis en production).
- Tokens d'invitation et de reset stockés en clair en base (à hacher si la base devait être exposée).
- Un futur front doit afficher les réponses de l'IA comme du texte, pas comme du HTML.

## ⚠️ Git

Le dépôt a pour racine le dossier personnel. Toujours ajouter les fichiers par chemin
(`git add Desktop/nodjs1/auth-api`), **jamais** `git add .` ou `git add -A` depuis `~`.
