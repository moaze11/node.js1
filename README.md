# Auth API — Helpdesk sécurisé avec triage IA

API backend d'une plateforme de support (helpdesk) : comptes sur invitation, rôles, tickets,
et une IA qui trie chaque nouveau ticket.

**Stack** : Node.js 20 · Express 5 · TypeScript · Prisma (SQLite en dev, PostgreSQL possible) · Zod · JWT · Resend · OpenAI · Jest

---

## Démarrage

> ⚠️ Utiliser **Node 20** (`nvm use 20`). Sous Node 26 (npm 11), les scripts d'installation de Prisma sont bloqués et Prisma plante.

```bash
nvm use 20
npm ci                       # dépendances
cp .env.example .env         # puis remplir les valeurs (voir plus bas)
npx prisma migrate deploy    # crée / met à jour la base
npm run dev                  # http://localhost:3002
```

- Documentation interactive : **http://localhost:3002/api-docs** (Swagger)
- Santé du serveur : `GET /health`
- Tests : `npm test` (117 tests, aucune base ni clé nécessaire)

### Variables d'environnement (`.env`)

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Base de données (`file:./dev.db` en dev) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | **Obligatoires**, 32 caractères minimum, différents. Générer : `openssl rand -hex 32` |
| `RESEND_API_KEY` | Envoi des emails (invitations, reset) |
| `APP_URL` | URL mise dans les liens des emails (défaut `http://localhost:3002`) |
| `OPENAI_API_KEY` | Triage IA des tickets. Sans clé : les tickets sont créés sans réponse IA |
| `OPENAI_MODEL` | Modèle utilisé (défaut `gpt-4o-mini`) |
| `ALLOW_SUPERADMIN_BOOTSTRAP` | `true` pour ouvrir `/auth/super-admin` en production (premier déploiement uniquement) |

Le `.env` n'est **jamais** commité (`.gitignore`). Seul `.env.example` (sans valeurs) l'est.

---

## Fonctionnalités

### Comptes et authentification (Part 2)
- **Pas d'inscription publique** : un SuperAdmin crée les comptes, ou un Admin invite par email.
- L'invité reçoit un lien, choisit son mot de passe → compte créé avec le rôle `User`.
- Login email + mot de passe → **access token** (15 min) + **refresh token** (7 jours).
- **Rotation** : chaque refresh révoque l'ancien token et en émet un nouveau. Logout = révocation.
- Mot de passe oublié → email avec un lien **à usage unique** (1 h). Après un reset, toutes les sessions sont coupées.
- Désactivation / réactivation d'un compte (coupe ses sessions immédiatement).
- Emails envoyés via **Resend**.

### Rôles (RBAC)

| Rôle | Peut |
|---|---|
| **SuperAdmin** | Créer des comptes, changer les rôles, désactiver/réactiver, lire les audit logs |
| **Admin** | Inviter, lister les utilisateurs, voir et gérer tous les tickets |
| **Agent** | Traiter les tickets qui lui sont assignés ou non assignés |
| **User** | Créer ses tickets, voir uniquement les siens, répondre dans leur fil |

Le rôle est **relu en base à chaque requête** : un changement de rôle ou une désactivation prend effet tout de suite, sans attendre l'expiration du token.

### Tickets (Part 3)
- Liste **paginée, filtrée, triée** : `GET /tickets?page=1&limit=20&status=open&priority=high&search=login&sortBy=createdAt&order=desc`
- Règles d'accès appliquées dans la requête elle-même (un User ne peut pas voir le ticket d'un autre : 404).
- Fil de discussion par ticket (`/tickets/:id/messages`) : messages de l'utilisateur, des agents et de l'IA.

### Triage IA (Part 4)
À la création d'un ticket, l'IA (OpenAI) le lit et décide :

| Cas | Statut | Réponse de l'IA |
|---|---|---|
| Problème **technique** (ou réponse absente de la FAQ) | `open` → attend un agent | Accusé de réception |
| **Question simple** couverte par la FAQ de la plateforme | `closed` | La réponse, tirée uniquement de la FAQ |
| **Hors-sujet** / spam | `closed` | Explique que ce n'est pas le bon endroit |

Elle fixe aussi la **priorité** (`low` / `medium` / `high`). L'IA ne résout rien elle-même.
Si l'utilisateur répond sur un ticket fermé, il est **rouvert** pour un agent.

Garde-fous : seuls le titre et la description sont envoyés (ni email, ni identifiant) ; le contenu du ticket
est traité comme une donnée (les « ignore tes instructions » sont ignorés) ; la réponse est imposée par un
schéma JSON puis revalidée ; si OpenAI est en panne, le ticket est créé quand même ; 10 tickets / heure / utilisateur.

### Qualité et sécurité (Part 3)
- **Validation** Zod de toutes les entrées (body, query, params) ; tri limité à une liste blanche.
- **Injection SQL** impossible : uniquement des requêtes Prisma paramétrées.
- **Anti brute-force** : login 5 / 15 min, routes sensibles 10 / 15 min, général 100 / 15 min.
- **Erreurs centralisées** : format unique `{ error, statusCode }`, jamais de détail interne.
- **Audit logs** en base : création de compte, changement de rôle (ancien → nouveau), désactivation, réactivation.
- Login sans fuite d'information (même réponse si l'email n'existe pas), en-têtes HTTP de sécurité, `X-Powered-By` masqué.
- **Tests** : 117 tests Jest + Supertest (auth, permissions, tickets, IA, emails, sécurité).
- **CI** GitHub Actions à chaque push : install → Prisma → typecheck → build → tests, sur Node 20 et 22.

---

## Endpoints

| Méthode | Route | Accès |
|---|---|---|
| POST | `/auth/super-admin` | Public, une seule fois (fermé en production) |
| POST | `/auth/login` | Public |
| POST | `/auth/refresh` | Public (refresh token) |
| POST | `/auth/logout` | Public (refresh token) |
| POST | `/auth/accept-invitation` | Public (token reçu par email) |
| POST | `/auth/forgot-password` | Public |
| POST | `/auth/reset-password` | Public (token reçu par email) |
| POST | `/auth/invite` | Admin, SuperAdmin |
| GET | `/user/profile` | Connecté |
| GET | `/user/roles` | Connecté |
| GET | `/admin/users` | Admin, SuperAdmin |
| POST | `/admin/users` | SuperAdmin |
| PATCH | `/admin/users/:id/role` | SuperAdmin (audité) |
| PATCH | `/admin/users/:id/status` | SuperAdmin (audité) |
| GET | `/admin/audit-logs` | SuperAdmin |
| GET | `/tickets` | Connecté (filtré selon le rôle) |
| POST | `/tickets` | Connecté (déclenche le triage IA) |
| GET | `/tickets/:id` | Connecté, si autorisé |
| PATCH | `/tickets/:id` | Agent, Admin, SuperAdmin |
| GET | `/tickets/:id/messages` | Connecté, si autorisé |
| POST | `/tickets/:id/messages` | Propriétaire ou staff autorisé |
| GET | `/agent/tickets` | Agent, Admin, SuperAdmin |
| GET | `/health`, `/api-docs`, `/api-docs.json` | Public |

Détail des paramètres et réponses : **`/api-docs`**.

---

## Architecture

Architecture en couches : chaque requête traverse les couches dans l'ordre.

```
Requête → app.ts → routes → middlewares → controllers → services → Prisma → base
                                 (erreur n'importe où → errorHandler)
```

```
src/
├── index.ts            Démarrage du serveur + création des 4 rôles
├── app.ts              Application Express (sans listen, importable par les tests)
├── routes/             Toutes les routes et leurs contrôles d'accès
├── middlewares/        auth (token + rôle relu en base), validate (Zod), rateLimit, errorHandler
├── controllers/        auth, email, role, ticket : HTTP uniquement
├── services/           Logique métier : ticket (règles d'accès), ai (OpenAI), email (Resend),
│                       audit, session
├── schemas/            Règles de validation Zod
├── utils/              JWT, hash bcrypt, génération de tokens
├── types/              Types + client Prisma partagé
└── swagger.ts          Documentation OpenAPI
prisma/
├── schema.prisma       User, Role, RefreshToken, Invitation, PasswordReset, Ticket, TicketMessage, AuditLog
└── migrations/         Historique SQL versionné
tests/                  unit, api, email-flows, email-service, ai-triage, security
```

Pourquoi ainsi : les contrôleurs ne gèrent que le HTTP, la logique est dans les services (testable sans
serveur), la sécurité est déclarée route par route (on voit qui a accès à quoi dans `routes/index.ts`),
et changer de fournisseur d'emails ou d'IA ne touche qu'un service.

---

## Scripts

```bash
npm run dev      # serveur en mode watch
npm run build    # compilation TypeScript → dist/
npm start        # lance la version compilée
npm test         # tous les tests
npx prisma studio   # explorer la base dans le navigateur
```

## Base de données

- **Dev** : SQLite (`prisma/dev.db`, non commité).
- **Prod** : PostgreSQL, voir `POSTGRES_SETUP.md`.

## Autres documents

- `HANDOFF.md` : reprendre le projet, scénario de test complet en curl
- `QUICK_REFERENCE.md` : aide-mémoire des commandes
- `CI_SETUP.md` : pipeline GitHub Actions
- `POSTGRES_SETUP.md` : passage à PostgreSQL
