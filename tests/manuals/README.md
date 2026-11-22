# Tests manuels Entra

L'AppHost provisionne une inscription sur le tenant de dev. Le tenant, l'abonnement et le secret du client confidentiel sont des paramètres Aspire : rien n'est écrit dans les sources.

Depuis `tests/manuals/apphost` :

```bash
aspire start
```

Aspire demande les trois paramètres après l'ouverture du tableau de bord, pas avant le lancement du processus :

- `entra-auth-app-tenant-id`
- `entra-auth-app-subscription-id` (valeur exposée à l'API)
- `entra-auth-web-client-secret` (secret créé au provisionnement)

Le provisionneur Azure peut encore afficher son propre choix d'abonnement s'il ne trouve pas `Azure:SubscriptionId` dans la configuration de l'AppHost.

Le tableau de bord ouvre la SPA. Elle est connectée à l'API par `VITE_API_BASE_URL`. L'URI de redirection SPA enregistrée est `http://localhost:5173/`.

## Scénarios

### Consentement utilisateur

Où : bouton « Consentement utilisateur » (`GET /graph/me`).

1. Accepter l'écran de consentement Entra s'il s'affiche.
2. Lire le nom du compte dans la réponse.

Attendu : `200` et le `displayName` du compte. Les permissions Graph déléguées de l'API sont `User.Read` et `User.Read.All`.

### Consentement administrateur

Où : bouton « Consentement administrateur » (`GET /graph/directory`), sans consentement admin préalable de `User.Read.All`.

1. Lancer l'appel.
2. Observer le corps renvoyé à la SPA avant la redirection.

Attendu : `401`, code `consent_required`, scope `api://{clientId}/.default`, puis une seule redirection `prompt=consent`. L'API réécrit `admin_consent_required` vers ce scope dès que `AzureAd:ClientId` est présent. Si Entra exige un administrateur, la page le dit et la SPA ne relance pas en boucle.

### Refus

Où : écran de consentement Entra ouvert par l'un des appels Graph.

1. Choisir Annuler.

Attendu : le message de refus s'affiche. Aucune seconde redirection.

### Claims challenge

Où : bouton « Claims challenge » (`GET /probe/claims`).

1. Lancer l'appel.

Attendu : redirection interactive qui repasse les claims renvoyés par l'API, sans `prompt=consent`.

### Onglet

Où : SPA déjà connectée.

1. Changer d'onglet, puis revenir.

Attendu : une acquisition silencieuse, sans second login, tant que le jeton peut être renouvelé. Le minuteur de cinq minutes avant `expiresOn` est couvert par les tests Vitest du package MSAL.

### 401

Où : bouton « 401 » (`GET /probe/unauthorized`).

1. Lancer l'appel.

Attendu : un rafraîchissement forcé, un second appel, puis une seule redirection de connexion.

### 403

Où : bouton « 403 » (`GET /probe/forbidden`).

1. Lancer l'appel.

Attendu : « Accès refusé ». Aucun login et aucun rafraîchissement forcé.
