# Quick Reference

## Commandes

```bash
nvm use 20                  # toujours (Prisma ne marche pas sous Node 26)
npm ci                      # installer
npx prisma migrate deploy   # appliquer les migrations
npm run dev                 # serveur http://localhost:3002
npm test                    # 139 tests
npm run build && npm start  # version compilée
npx prisma studio           # explorer la base
```

Swagger : **http://localhost:3002/api-docs**

## Routes

| Route | Accès | Corps / paramètres |
|---|---|---|
| `POST /auth/super-admin` | En-tête `X-Bootstrap-Token`, une fois | `{email, password}` |
| `POST /auth/login` | Public | `{email, password}` |
| `POST /auth/refresh` | Public | `{refreshToken}` → nouveaux access + refresh |
| `POST /auth/logout` | Public | `{refreshToken}` |
| `POST /auth/invite` | Admin+ | `{email}` |
| `POST /auth/accept-invitation` | Public | `{token, password}` |
| `POST /auth/forgot-password` | Public | `{email}` |
| `POST /auth/reset-password` | Public | `{token, password}` |
| `GET /user/profile` | Connecté | — |
| `GET /user/roles` | Connecté | — |
| `GET /admin/users` | Admin+ | — |
| `POST /admin/users` | SuperAdmin | `{email, password, roleId}` |
| `PATCH /admin/users/:id/role` | SuperAdmin | `{roleId}` |
| `PATCH /admin/users/:id/status` | SuperAdmin | `{isActive}` |
| `GET /admin/audit-logs` | SuperAdmin | `?page&limit&action` |
| `GET /tickets` | Connecté | `?page&limit&status&priority&assigneeId&search&sortBy&order` |
| `POST /tickets` | Connecté | `{title, description?, priority?}` → triage IA |
| `GET /tickets/:id` | Connecté, si autorisé | — |
| `PATCH /tickets/:id` | Agent+ | `{status?, priority?, assigneeId?}` |
| `GET /tickets/:id/messages` | Connecté, si autorisé | — |
| `POST /tickets/:id/messages` | Propriétaire / staff | `{content}` |
| `GET /agent/tickets` | Agent+ | mêmes filtres que `/tickets` |

En-tête des routes protégées : `Authorization: Bearer <accessToken>`

## Valeurs autorisées

- `status` : `open`, `in_progress`, `closed`
- `priority` : `low`, `medium`, `high`
- `sortBy` : `createdAt`, `updatedAt`, `title`, `status`, `priority` — `order` : `asc`, `desc`
- `limit` : 1 à 100 (défaut 20)
- Mot de passe : 8 caractères minimum

## Qui voit quels tickets

| Rôle | Tickets visibles |
|---|---|
| SuperAdmin, Admin | Tous |
| Agent | Assignés à lui + non assignés |
| User | Les siens uniquement |

## Limites de requêtes

| Quoi | Limite |
|---|---|
| Login | 5 / 15 min / IP |
| Invitation, reset, bootstrap | 10 / 15 min / IP |
| Création de ticket (appel IA) | 10 / heure / utilisateur |
| Tout le reste | 100 / 15 min / IP |

## Variables d'environnement

Voir `.env.example` : `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (≥ 32 caractères chacun),
`RESEND_API_KEY`, `APP_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`.

## Exemple rapide

```bash
TOKEN=$(curl -s -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "SecurePass123"}' | jq -r '.accessToken')

curl http://localhost:3002/user/profile -H "Authorization: Bearer $TOKEN"
```
