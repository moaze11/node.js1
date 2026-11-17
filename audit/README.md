# Audit de sécurité de l'API de tickets

Pour chaque faille, j'ai fait la même chose : j'ai lancé une vraie attaque sur la version
vulnérable (commit `ae87776`), j'ai corrigé le code, puis j'ai relancé exactement la même
attaque pour vérifier qu'elle ne marche plus. Une faille n'est dans cette liste que si l'attaque
a vraiment marché.

## Les 10 failles

- [VULN-001](VULN-001-bootstrap-superadmin/fiche.md) : N'importe qui peut devenir SuperAdmin (Élevée)
- [VULN-003](VULN-003-refresh-token-reutilisable/fiche.md) : Un refresh token peut servir plusieurs fois (Élevée)
- [VULN-004](VULN-004-tokens-en-clair-en-base/fiche.md) : Les tokens sont écrits en clair dans la base (Élevée)
- [VULN-007](VULN-007-brute-force-multi-ip/fiche.md) : On contourne l'anti brute-force en changeant d'IP (Élevée)
- [VULN-002](VULN-002-token-valide-apres-logout/fiche.md) : Le token marche encore après la déconnexion (Moyenne)
- [VULN-005](VULN-005-connexions-absentes-audit/fiche.md) : Les connexions ne sont pas dans le journal d'audit (Moyenne)
- [VULN-006](VULN-006-enumeration-emails-timing/fiche.md) : Le temps de réponse révèle si un email a un compte (Moyenne)
- [VULN-008](VULN-008-bombardement-emails-reset/fiche.md) : On peut inonder quelqu'un d'emails de reset (Moyenne)
- [VULN-009](VULN-009-injection-prompt-triage-ia/fiche.md) : Un ticket peut forcer sa priorité auprès de l'IA (Moyenne)
- [VULN-010](VULN-010-swagger-public-entetes/fiche.md) : La carte de l'API est publique en production (Faible)

Au total : 4 élevées, 5 moyennes, 1 faible. Toutes sont corrigées, et au retest toutes les
attaques échouent.

J'ai aussi essayé des attaques qui échouaient déjà avant mes corrections (IDOR, injection SQL,
JWT forgé…). Elles sont dans [tests-conformes](tests-conformes/fiche.md).

Enfin, j'ai passé deux outils d'analyse statique, Semgrep et SonarQube, sur le code avant et
après correction. Ils n'ont trouvé aucune des 10 failles : voir
[analyse-statique](analyse-statique/fiche.md).

## Organisation

Chaque faille a son dossier, avec tout ce qui la concerne :

```
audit/
├── README.md                      ce sommaire
├── VULN-001-bootstrap-superadmin/
│   ├── fiche.md                   la fiche complète
│   ├── poc.sh                     le script d'attaque
│   ├── avant.png                  capture : l'attaque marche sur le code vulnérable
│   └── apres.png                  capture : la même attaque est bloquée après correction
├── ...                            VULN-002 à VULN-010, même contenu
├── tests-conformes/               attaques qui échouent (fiche, script, résultat)
├── analyse-statique/              Semgrep et SonarQube : rapports et comparaison
└── outils/
    ├── demo.sh                    lance une attaque, avant ou après correction
    ├── start-test-api.sh          démarre une API de test sur une base vide (port 3099)
    └── common.sh                  fonctions communes aux scripts
```

Chaque faille a aussi ses tests automatiques dans `tests/`, nommés `(VULN-XXX)` ou `VULN-XXX:`.
La CI les relance à chaque push.

## Rejouer une attaque

Depuis le dossier `auth-api`, avec Node 20 (`nvm use 20`) :

```bash
./audit/outils/demo.sh 002 poc      # sur le code vulnérable : l'attaque marche
./audit/outils/demo.sh 002 retest   # sur le code corrigé : l'attaque échoue
```

Le script démarre tout seul une API de test sur une base vide, donc la vraie base n'est jamais
touchée. Pour la version vulnérable, il extrait l'ancien code dans `/tmp/auth-api-vulnerable`
sans modifier le projet. Attention, VULN-009 appelle vraiment OpenAI, avec la clé
`OPENAI_API_KEY` du `.env`.
