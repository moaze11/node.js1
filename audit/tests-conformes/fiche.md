# Attaques tentées qui échouent

J'ai aussi lancé ces attaques contre l'API. Elles échouent parce que les protections font leur
travail. Ce ne sont donc pas des failles, et elles n'ont pas de fiche VULN.

Script : [tests.sh](tests.sh). Résultat brut : [resultat.txt](resultat.txt).

## T1 : lire le ticket de quelqu'un d'autre (IDOR)

Alice essaie de lire le ticket de Bob avec `GET /tickets/1` et `GET /tickets/1/messages`.
L'API répond `404`. Le contrôle d'accès est dans `ticket.service.ts` (`canViewTicket`). Elle
répond `404` plutôt que `403` pour ne même pas révéler que le ticket existe.

## T2 : se donner des droits d'admin

Alice, simple User, appelle `/admin/users`, essaie de se mettre SuperAdmin et de lire le
journal d'audit. Elle reçoit `403` à chaque fois. C'est le rôle de `requireAdmin` et
`requireSuperAdmin`, et le rôle est relu en base à chaque requête.

## T3 : injection SQL

J'ai essayé `search=' OR 1=1 --`, `sortBy=password` et `sortBy=id;DROP TABLE User`. Le premier
renvoie `200` avec 0 ticket, les deux autres `400`, et la table `User` est intacte. Prisma
utilise des requêtes paramétrées, et le tri n'accepte qu'une liste fixe de champs (Zod).

## T4 : fabriquer un faux JWT

J'ai envoyé un token `alg: none` avec le rôle SuperAdmin, puis un token signé avec un autre
secret. Les deux donnent `401`. jsonwebtoken 9 refuse `none`, et le vrai secret fait au moins
32 caractères.

## T5 : ajouter des champs en trop

J'ai créé un ticket en ajoutant `ownerId=1`, `status=closed` et `assigneeId=1`. Le ticket est
créé avec Alice comme propriétaire, `status=open` et sans agent assigné : Zod supprime les
champs qui ne sont pas prévus.

## T6 : garder son token après la désactivation du compte

L'admin désactive Alice, puis Alice rappelle `/user/profile` avec son token. Elle reçoit `401`
tout de suite, parce que le statut du compte est relu en base à chaque requête.

## Comment je les ai lancées

Sur la version corrigée, avec le serveur démarré par
`OPENAI_API_KEY= ./audit/outils/start-test-api.sh`, pour créer les tickets sans appeler l'IA.
Ces cas sont aussi couverts par les tests automatiques (`tests/security.test.ts` et
`tests/api.test.ts`).
