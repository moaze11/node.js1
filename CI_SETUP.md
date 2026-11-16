# CI — GitHub Actions

Fichier : `.github/workflows/ci.yml`. Déclenché à chaque push (toutes branches) et sur les pull requests.

Étapes, sur Node 20.x et 22.x :
1. `npm ci`
2. `npx prisma generate`
3. `npx tsc --noEmit -p tsconfig.test.json` (types de `src/` et `tests/`)
4. `npm run build`
5. `npm test -- --ci`

Les tests mockent Prisma (`tests/helpers/prismaMock.ts`) : la CI n'a besoin d'aucune base de données.
Les variables d'environnement de la CI sont des valeurs factices définies dans le workflow.

## Important : emplacement du workflow

GitHub ne lit `.github/workflows/` qu'**à la racine du dépôt**. Le dépôt actuel a pour racine
le dossier personnel, donc le workflow actif est `~/.github/workflows/ci.yml`
(il travaille dans `Desktop/nodjs1/auth-api`).
`auth-api/.github/workflows/ci.yml` est la même CI, prête si `auth-api/` devient un dépôt à part.

## En local

```bash
nvm use 20            # Node 26 / npm 11 bloque les scripts d'install de Prisma
npm ci
npx prisma migrate deploy
npm test
```
