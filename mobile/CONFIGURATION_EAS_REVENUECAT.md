# Configuration EAS / APNs / RevenueCat — préparation recette réelle

État de référence après application des migrations Push + RevenueCat sur Lovable Cloud.

## 0. Bundle identifier final validé

Le bundle identifier iOS définitif de Lingo est :

`com.lingo.app`

Il est désormais configuré dans `mobile/app.json` et doit être utilisé de façon cohérente pour EAS, Apple Developer, App Store Connect, APNs et l'app iOS RevenueCat.

Ne pas recréer de credentials Apple avec un autre bundle identifier sans décision explicite.

## 1. EAS — action manuelle requise

Depuis `mobile/` :

```bash
eas login
eas whoami
eas init
```

Contrôler ensuite que `app.json` contient :

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "<UUID EAS>"
      }
    }
  }
}
```

Le code Push existant lit déjà `extra.eas.projectId` puis `Constants.easConfig.projectId` en fallback.

Puis :

```bash
npx expo install expo-dev-client
eas build:configure
```

Le profil `development` doit utiliser un development client et une distribution interne. Ne pas inventer de configuration supplémentaire tant que la configuration générée par EAS n'a pas été inspectée.

## 2. APNs / Push iOS

Pré-requis : compte Apple Developer payant et bundle identifier final `com.lingo.app`.

Pour un build EAS, laisser EAS gérer les credentials lors du premier build iOS ou utiliser :

```bash
eas credentials -p ios
```

Vérifier :

- clé APNs configurée ;
- profil de provisioning compatible avec `com.lingo.app` ;
- entitlement `aps-environment` présent dans le build ;
- `extra.eas.projectId` disponible ;
- token Expo Push généré sur appareil ;
- ligne correspondante créée dans `device_tokens` ;
- aucun secret APNs commité dans Git.

Le test fonctionnel obligatoire reste : app en arrière-plan/fermée → message depuis un second compte → push → tap → bonne conversation.

## 3. RevenueCat — stratégie de test recommandée

Le projet utilise `react-native-purchases` 10.7.1, donc il est suffisamment récent pour utiliser RevenueCat Test Store.

### 3.1 Première validation sans App Store Connect

Créer un projet RevenueCat puis utiliser son Test Store pour valider le parcours avant de connecter Apple :

1. créer/ouvrir le Test Store ;
2. créer un produit de test ;
3. créer l'entitlement **exactement** `premium` ;
4. attacher le produit à `premium` ;
5. créer une Offering courante avec au moins un Package ;
6. récupérer la Test Store API key ;
7. utiliser cette clé uniquement dans un build de développement via `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` ;
8. tester succès / échec / annulation / restauration ;
9. vérifier `CustomerInfo.entitlements.active.premium` ;
10. vérifier le webhook et la ligne `subscriptions` côté Lovable Cloud.

**Interdiction : ne jamais soumettre un build App Store avec une Test Store API key.**

### 3.2 Webhook RevenueCat

Endpoint déjà implémenté :

`POST /api/public/payments/revenuecat-webhook`

Le backend attend un header `Authorization` strictement égal à `REVENUECAT_WEBHOOK_SECRET`.

À configurer :

- URL HTTPS publique réellement accessible ;
- valeur d'Authorization aléatoire forte ;
- même valeur côté serveur dans `REVENUECAT_WEBHOOK_SECRET` ;
- sandbox activé pendant les tests ;
- tester un événement de dashboard puis un vrai achat de test ;
- vérifier l'idempotence dans `processed_revenuecat_events`.

Ne jamais mettre `REVENUECAT_WEBHOOK_SECRET` dans `mobile/.env`.

**Point commercial à vérifier avant activation : les Webhooks RevenueCat peuvent dépendre du plan RevenueCat. Toute dépense ou upgrade doit être validé par le propriétaire du projet avant souscription.**

## 4. RevenueCat + App Store Connect — production/sandbox Apple

À faire uniquement après validation des comptes Apple :

1. créer/identifier l'app `com.lingo.app` dans App Store Connect ;
2. accepter les accords Apple nécessaires aux apps payantes/IAP ;
3. créer le ou les produits d'abonnement ;
4. connecter l'app Apple `com.lingo.app` à RevenueCat ;
5. importer/configurer les produits ;
6. les rattacher à l'entitlement `premium` ;
7. les placer dans l'Offering utilisée par l'app ;
8. remplacer la Test Store API key par la **clé publique iOS RevenueCat** pour les builds Apple ;
9. créer un utilisateur Apple Sandbox ;
10. tester achat, annulation, renouvellement accéléré, expiration et restauration ;
11. vérifier la synchronisation dans `subscriptions` ;
12. vérifier qu'un Premium mobile est reconnu par `GET /api/quota` et sur le web.

Ne pas inventer prix, période, essai gratuit ou product IDs : demander validation produit avant création.

## 5. Recette RevenueCat — PASS/FAIL

### Test Store

- [ ] Offering chargée
- [ ] Package affiché
- [ ] achat simulé réussi
- [ ] `premium` actif dans `CustomerInfo`
- [ ] webhook reçu
- [ ] ligne `subscriptions.provider = revenuecat`
- [ ] `is_premium_user()` retourne vrai pour l'utilisateur
- [ ] `GET /api/quota` retourne Premium
- [ ] échec simulé géré sans crash
- [ ] annulation simulée gérée comme annulation utilisateur
- [ ] restauration fonctionnelle

### Apple Sandbox / TestFlight

- [ ] produit réel remonté depuis l'App Store
- [ ] achat Sandbox terminé
- [ ] entitlement `premium` actif
- [ ] webhook RevenueCat reçu en environnement sandbox
- [ ] backend Premium mis à jour
- [ ] app mobile Premium
- [ ] web reconnaît le même utilisateur Premium
- [ ] restauration après suppression/réinstallation
- [ ] expiration/annulation retire l'accès au bon moment
- [ ] Stripe web toujours non régressé

## 6. Ce qui nécessite encore une intervention humaine

- connexion `eas login` / éventuel 2FA ;
- compte Apple Developer / App Store Connect ;
- acceptation éventuelle d'accords Apple ;
- création des produits et choix prix/périodes ;
- création/configuration du projet RevenueCat ;
- validation de toute dépense RevenueCat/Apple ;
- installation et recette sur iPhone physique.

Aucun secret ne doit être copié dans Git ou dans ce document.
