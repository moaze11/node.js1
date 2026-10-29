# 🐘 PostgreSQL Setup

**Dev** : SQLite (dev.db)
**Prod** : PostgreSQL

## Installation PostgreSQL

### macOS
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Windows
Télécharger : https://www.postgresql.org/download/windows/

## Configuration

### 1️⃣ Créer la base de données

```bash
createdb auth_db
```

### 2️⃣ Mettre à jour `.env`

```
DATABASE_URL="postgresql://postgres:password@localhost:5432/auth_db"
JWT_SECRET="your-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret"
PORT=3002
```

⚠️ Remplacer `password` par le vrai mot de passe PostgreSQL

### 3️⃣ Modifier `prisma/schema.prisma`

Changer le provider de SQLite à PostgreSQL :

```prisma
datasource db {
  provider = "postgresql"  # Était "sqlite"
  url      = env("DATABASE_URL")
}
```

### 4️⃣ Recréer les migrations

```bash
# Supprimer les migrations SQLite
rm -rf prisma/migrations

# Créer les migrations PostgreSQL
npx prisma migrate dev --name init
```

### 5️⃣ Lancer le serveur

```bash
npm run dev
```

## Vérifier la migration

### Avec Prisma Studio
```bash
npx prisma studio
```

### Avec psql
```bash
psql auth_db

# Voir les tables
\dt

# Voir les users
SELECT id, email, role_id FROM "User";

# Quitter
\q
```

## Sauvegarde PostgreSQL

```bash
# Dump
pg_dump auth_db > backup.sql

# Restore
psql auth_db < backup.sql
```

## Permissions PostgreSQL

Si erreur d'accès :

```bash
psql -U postgres

# Créer un user
CREATE USER auth_user WITH PASSWORD 'secure_password';

# Donner les droits
ALTER DATABASE auth_db OWNER TO auth_user;
GRANT ALL PRIVILEGES ON DATABASE auth_db TO auth_user;
```

Puis mettre à jour `.env` :
```
DATABASE_URL="postgresql://auth_user:secure_password@localhost:5432/auth_db"
```

## Revenir à SQLite

```bash
# 1. Modifier .env
DATABASE_URL="file:./dev.db"

# 2. Modifier prisma/schema.prisma
provider = "sqlite"

# 3. Recréer migrations
rm -rf prisma/migrations
npx prisma migrate dev --name init
```

## Perfs

| Métrique | SQLite | PostgreSQL |
|----------|--------|------------|
| Setup | Instant | Quelques min |
| Requêtes | Rapide | Très rapide |
| Concurrence | Limitée | Excellente |
| Scaling | Non | Oui |

**Résumé** :
- SQLite = Parfait pour dev/small projects
- PostgreSQL = Production, scaling, concurrence
