# ⚡ Quick Reference — Toutes les commandes

## Setup (une fois)

```bash
npm install
npm run dev
```

## Endpoints

### 1️⃣ Auth Publics (sans token)

```bash
# Créer SuperAdmin (une fois)
POST /auth/super-admin
{"email": "admin@example.com", "password": "Pass123"}

# Login
POST /auth/login
{"email": "admin@example.com", "password": "Pass123"}

# Renouveler token
POST /auth/refresh
{"refreshToken": "eyJhbGc..."}

# Logout (révoquer)
POST /auth/logout
{"refreshToken": "eyJhbGc..."}
```

### 2️⃣ Email Publics (sans token)

```bash
# Inviter un user
POST /auth/invite
{"email": "newuser@example.com"}

# Accepter invitation
POST /auth/accept-invitation
{"token": "abc123...", "password": "Pass123"}

# Forgot password
POST /auth/forgot-password
{"email": "user@example.com"}

# Reset password
POST /auth/reset-password
{"token": "xyz789...", "password": "NewPass123"}
```

### 3️⃣ SuperAdmin Routes (Bearer token required)

```bash
# Créer un user
POST /admin/users
-H "Authorization: Bearer TOKEN"
{"email": "admin2@example.com", "password": "Pass123", "roleId": 2}

# Assigner un rôle
PATCH /admin/users/:id/role
{"roleId": 3}

# Disable/Enable user
PATCH /admin/users/:id/status
{"isActive": false}
```

### 4️⃣ Admin Routes (Bearer token required)

```bash
# Lister tous les users
GET /admin/users
-H "Authorization: Bearer TOKEN"
```

### 5️⃣ Agent Routes (Bearer token required)

```bash
# Voir les tickets
GET /agent/tickets
-H "Authorization: Bearer TOKEN"
```

### 6️⃣ User Routes (Bearer token required)

```bash
# Voir son profil
GET /user/profile
-H "Authorization: Bearer TOKEN"

# Voir les rôles
GET /user/roles
-H "Authorization: Bearer TOKEN"
```

## Rôles (roleId)

| ID | Nom | Permissions |
|----|-----|------------|
| 1 | SuperAdmin | Créer users, assigner rôles |
| 2 | Admin | Lister users |
| 3 | Agent | Voir tickets |
| 4 | User | Voir profil |

## Scripts npm

```bash
npm run dev       # Lancer en mode watch
npm run build     # Compiler TypeScript
npm start         # Lancer la version compilée
```

## Env Variables

```
DATABASE_URL=file:./dev.db
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
PORT=3002
```

## curl Examples (Copier/coller direct)

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "AdminPassword123"}' \
  | jq -r '.accessToken')

# 2. Utiliser le token
curl -X GET http://localhost:3002/user/profile \
  -H "Authorization: Bearer $TOKEN"

# 3. Créer un user
curl -X POST http://localhost:3002/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email": "admin2@example.com", "password": "Pass123", "roleId": 2}'
```

## Troubleshooting

| Problème | Solution |
|----------|----------|
| Port 3002 occupé | `lsof -i :3002` then `kill -9 PID` |
| Token expiré | Faire un nouveau login |
| Forbidden (403) | Vérifier le rôle requis |
| Not found (404) | Vérifier l'endpoint ou l'ID |
| Database error | `npx prisma studio` pour vérifier |

## Fichiers importants

- `HANDOFF.md` — Guide complet
- `README.md` — Vue d'ensemble
- `POSTGRES_SETUP.md` — Migration PostgreSQL
- `src/middleware.ts` — Auth + RBAC logic
- `src/emailController.ts` — Invitations + reset
