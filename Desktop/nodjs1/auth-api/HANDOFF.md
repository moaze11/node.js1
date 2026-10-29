# 📋 HANDOFF — Guide pour reprendre le projet

## Prérequis

- Node.js v18+ : https://nodejs.org/
- npm (livré avec Node)
- (Optional) PostgreSQL : voir POSTGRES_SETUP.md

## Installation & Lancement

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer le serveur (watch mode)
npm run dev

# 3. Compiler TypeScript (si besoin)
npm run build
npm start
```

**Server démarre sur** : `http://localhost:3002`

## Workflow typique

### 1️⃣ Créer un SuperAdmin (une fois)

```bash
curl -X POST http://localhost:3002/auth/super-admin \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "SecurePass123"}'
```

**Réponse** :
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": { "id": 1, "email": "admin@example.com", "role": "SuperAdmin" }
}
```

### 2️⃣ Login

```bash
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "SecurePass123"}'
```

**Sauvegarder le token** : `SUPER_ADMIN_TOKEN="eyJhbGc..."`

### 3️⃣ SuperAdmin crée un autre user

```bash
curl -X POST http://localhost:3002/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  -d '{"email": "admin2@example.com", "password": "SecurePass123", "roleId": 2}'
```

(roleId: 1=SuperAdmin, 2=Admin, 3=Agent, 4=User)

### 4️⃣ Inviter un user (sans créer manuellement)

```bash
curl -X POST http://localhost:3002/auth/invite \
  -H "Content-Type: application/json" \
  -d '{"email": "newuser@example.com"}'
```

**Récupérer le token** de la réponse, puis user l'accepte :

```bash
curl -X POST http://localhost:3002/auth/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{"token": "e9baa1ee5a3e...", "password": "UserPass123"}'
```

### 5️⃣ User oublie son password

```bash
curl -X POST http://localhost:3002/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

**Récupérer le reset token** de la console, puis reset :

```bash
curl -X POST http://localhost:3002/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "fe3bf6bd...", "password": "NewPass456"}'
```

### 6️⃣ Accéder à une route protégée

```bash
# Get own profile
curl -X GET http://localhost:3002/user/profile \
  -H "Authorization: Bearer $USER_TOKEN"

# Admin liste les users
curl -X GET http://localhost:3002/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Agent voit les tickets
curl -X GET http://localhost:3002/agent/tickets \
  -H "Authorization: Bearer $AGENT_TOKEN"
```

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `src/index.ts` | Routes + serveur |
| `src/middleware.ts` | Auth + RBAC |
| `src/authController.ts` | Login, tokens |
| `src/emailController.ts` | Invitations, reset password |
| `src/roleController.ts` | Endpoints protégés |
| `prisma/schema.prisma` | Modèles DB |
| `.env` | Config (PORT, JWT_SECRET) |

## Base de données

### Modèles

1. **User** - email, password (hashé), role, isActive
2. **Role** - SuperAdmin, Admin, Agent, User
3. **RefreshToken** - tokens de renouvellement (révocables)
4. **Invitation** - tokens single-use pour invitations (7 jours)
5. **PasswordReset** - tokens single-use pour reset (1 heure)

### Voir la DB (SQLite)

```bash
# Ouvrir avec Prisma Studio
npx prisma studio

# Ou directement avec SQLite
sqlite3 dev.db
```

## Environnement (.env)

```
DATABASE_URL="file:./dev.db"           # SQLite (dev)
JWT_SECRET="your-secret-key"           # À changer en prod
JWT_REFRESH_SECRET="your-refresh-secret"
PORT=3002
```

**⚠️ En production** : Générer des secrets forts
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Erreurs courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| "Port 3002 already in use" | Autre process sur le port | `pkill -f "ts-node-dev"` |
| "Invalid token" | Token expiré | Refaire un login |
| "Only Admin can access" | Rôle insuffisant | Utiliser un token Admin+ |
| "User not found" | Email n'existe pas | Créer ou inviter d'abord |

## Améliorations futures

- [ ] 2FA (Two-Factor Authentication)
- [ ] OAuth (Google, GitHub)
- [ ] Rate limiting
- [ ] Audit logs
- [ ] User permissions (finer-grained)
- [ ] Email confirmation (EmailVerified)
- [ ] API docs (Swagger)

## Support

- **Docs** : README.md
- **PostgreSQL** : POSTGRES_SETUP.md
- **Code** : Bien commenté, types TS complètes
