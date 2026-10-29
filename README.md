# Auth API — Système d'authentification complet

API d'authentification avec JWT, invitations, reset password et RBAC (rôles).

**Stack** : Node.js + Express + TypeScript + Prisma + SQLite (PostgreSQL ready)

## Quick Start

```bash
npm install
npm run dev
```

**Server** : `http://localhost:3002`

## Architecture

```
Client (login, invite, reset)
        ↓
  Express Routes
        ↓
  Auth + Email + Role Controllers
        ↓
  Middleware (Auth, RBAC)
        ↓
  Prisma ORM
        ↓
  SQLite Database
```

## Endpoints Publics

```
POST   /auth/super-admin        → Créer super admin (une fois)
POST   /auth/login              → Login + tokens
POST   /auth/refresh            → Renouveler access token
POST   /auth/logout             → Logout

POST   /auth/invite             → Inviter un user
POST   /auth/accept-invitation  → Accepter invitation + créer compte
POST   /auth/forgot-password    → Demander reset password
POST   /auth/reset-password     → Réinitialiser password
```

## Endpoints Protégés (Authentification requise)

### SuperAdmin only
```
POST   /admin/users              → Créer un user
PATCH  /admin/users/:id/role     → Assigner un rôle
PATCH  /admin/users/:id/status   → Disable/Enable user
```

### Admin+
```
GET    /admin/users              → Lister tous les users
```

### Agent+
```
GET    /agent/tickets            → Voir les tickets
```

### Tous (authentifiés)
```
GET    /user/profile             → Voir son profil
GET    /user/roles               → Voir les rôles disponibles
```

## Rôles (Hiérarchie)

1. **SuperAdmin** - Créer users, assigner rôles
2. **Admin** - Lister et gérer users
3. **Agent** - Voir et gérer les tickets
4. **User** - Accès basique

## Structure

```
src/
├── index.ts              (Routes)
├── authController.ts     (Login, tokens)
├── emailController.ts    (Invitations, reset)
├── roleController.ts     (Endpoints RBAC)
├── middleware.ts         (Auth + RBAC)
├── emailService.ts       (Emails)
├── utils.ts              (JWT, bcrypt)
├── tokenUtils.ts         (Tokens aléatoires)
└── types.ts              (Interfaces)

prisma/
├── schema.prisma         (5 modèles : User, Role, RefreshToken, Invitation, PasswordReset)
└── migrations/           (DB history)
```

## Bases de données

- **Dev** : SQLite (dev.db)
- **Prod** : PostgreSQL (voir POSTGRES_SETUP.md)

## Sécurité

✅ Passwords hashés (bcryptjs)
✅ JWT access tokens (15 min)
✅ JWT refresh tokens (7 jours)
✅ Tokens single-use (invitations, reset)
✅ RBAC middleware
✅ Tokens révocables (logout)

## Tests

Voir HANDOFF.md pour des exemples curl complets.
