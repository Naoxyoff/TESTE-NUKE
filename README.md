# Orbis Nuke Test Bot

Bot de stress-test **contrôlé** pour vérifier qu'Orbis détecte une rafale de suppressions de salons/rôles.

## Sécurité
- verrouillé sur `TEST_GUILD_ID`
- commandes réservées à `OWNER_USER_ID`
- maximum 25 salons et 25 rôles par exécution
- supprime uniquement les ressources créées par ce bot pendant le test
- aucune suppression de membres, aucune modification du serveur et aucun nuke arbitraire
- ne jamais commit `.env`

## Installation

```bash
npm install
cp .env.example .env
npm start
```

## Test

Configure Orbis avec un seuil bas, ne whitelist pas le bot de test, puis lance :

```
/setup-test channels:10 roles:10
/attack channels:10 roles:10 safety:ORBiS-TEST-ONLY
```

`/cleanup` supprime les ressources de test encore suivies.
