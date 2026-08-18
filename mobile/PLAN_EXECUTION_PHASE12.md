# Plan d'exécution final — avant recette réelle

Document de synthèse demandé après vérification réelle de l'environnement.
Aucune action destructive ou externe n'a été effectuée en le préparant :
aucune migration poussée, aucun rollback exécuté, aucune configuration
externe modifiée. Complète [`PRE_RECETTE_CHECKLIST.md`](./PRE_RECETTE_CHECKLIST.md)
(détail technique) et [`RECETTE_IPHONE.md`](./RECETTE_IPHONE.md) (recette
écran par écran, référencée en §5 ci-dessous).

---

## 1. État réel des migrations Supabase — confirmé par preuve directe

Le CLI Supabase n'a toujours pas accès au bon projet. Vérification faite
autrement : requêtes REST réelles (lecture seule, clé publique déjà
prévue pour un client) contre la base de production, distinguant
"table/colonne absente" (`42703`/`PGRST205`) de "présente mais
inaccessible à ce rôle" (`42501`).

**Résultat, confirmé et non plus supposé :**

| Migration | État réel |
|---|---|
| Les 26 migrations antérieures (`20260806042707` → `20260810210705`) | ✅ **Toutes appliquées** — vérifié sur la première, la dernière, et plusieurs intermédiaires (tables *et* colonnes *et* changements de droits RLS) |
| `20260818150000` — Push (`device_tokens`, `messages.push_notified_at`) | ❌ **Non appliquée** |
| `20260818160000` — RevenueCat (`subscriptions.provider*`, `processed_revenuecat_events`) | ❌ **Non appliquée** |

Aucune divergence inattendue. La situation est exactement celle
supposée en Phase 12, désormais vérifiée et non plus déduite. Détail
complet des sondes dans `PRE_RECETTE_CHECKLIST.md` §1.

**Non exécuté, aucune migration poussée.**

## 2. Sauvegarde / capacité de rollback

- **Non vérifiable depuis cet environnement** : savoir si le projet a
  un plan Supabase incluant le PITR (Point-in-Time Recovery) nécessite
  un accès au Dashboard (Project Settings → Backups) ou à l'API de
  gestion Supabase — aucun des deux n'est accessible ici (même
  limitation que pour `supabase link`). **À vérifier par vous avant
  toute migration.**
- **Méthode de rollback documentée** (SQL fourni à titre informatif
  dans `PRE_RECETTE_CHECKLIST.md` §4, non inclus dans
  `supabase/migrations/`, non testée) : possible dans les deux sens
  indépendamment (annuler RevenueCat seul, ou Push seul, ou les deux),
  tant qu'aucune ligne `subscriptions` avec `provider='revenuecat'`
  n'a encore été insérée par le webhook au moment du rollback (sinon
  remettre `NOT NULL` sur les colonnes Stripe échouerait sur ces
  lignes).
- **Recommandation** : quel que soit le plan Supabase, faites un
  `pg_dump` manuel (au minimum `subscriptions`, `messages`,
  `processed_stripe_events`) immédiatement avant d'appliquer, en plus
  du PITR si disponible. Ne pas se reposer uniquement sur ma lecture du
  SQL — c'est un contrôle de sécurité, pas une formalité.

**Aucun rollback exécuté, aucun snapshot déclenché depuis cet environnement.**

## 3. Application des migrations — préparée, non exécutée

L'état confirmé en §1 satisfait la condition posée : les deux
migrations manquent réellement, dans cet ordre de dépôt déjà correct.

**Ordre :** 1) Push (`20260818150000`) → 2) RevenueCat (`20260818160000`).

### Niveau de risque : **FAIBLE, pas nul**

Ce qui reste réellement à risque, même si la migration est additive :

| Risque | Détail | Contrôle associé |
|---|---|---|
| Verrou bref sur `subscriptions`/`messages` | `ALTER TABLE` (même métadonnées seules) prend un verrou `ACCESS EXCLUSIVE` momentané — sur une table en écriture active (webhook Stripe, envoi de messages), une requête concurrente peut attendre quelques millisecondes à quelques secondes selon la charge réelle au moment T | Appliquer hors pic de trafic ; surveiller les logs Postgres pendant l'application |
| Backfill (`UPDATE ... SET provider_customer_id = ...`) | Écrit réellement sur chaque ligne Stripe existante — durée et verrouillage dépendent du nombre de lignes réel, que je ne connais pas depuis cet environnement | Vérifier `SELECT count(*) FROM subscriptions` avant d'appliquer ; si le volume est important, envisager une fenêtre de maintenance |
| Aucun test contre la vraie base | Les 128 tests web sont unitaires (clients Supabase mockés) — le comportement réel post-migration (webhook Stripe, `is_premium_user`, RLS) n'a jamais été exercé contre la production | Revalider manuellement immédiatement après (checklist ci-dessous) avant de considérer la migration "faite" |
| Revue à un seul regard | J'ai relu le SQL, mais aucune deuxième personne ni environnement de staging ne l'a validé avant vous | Relire vous-même `supabase/migrations/202608181*.sql` avant d'exécuter, ne pas se fier uniquement à mon analyse |
| Rollback non testé | Le SQL de rollback (§2) n'a jamais été exécuté nulle part | Le garder prêt mais espérer ne pas en avoir besoin ; le tester d'abord sur un environnement non-prod si vous en avez un |

### Re-vérifications demandées (reconfirmées ici, pas seulement répétées)

- **Compatibilité Stripe existant** : la migration ne modifie ni ne
  supprime aucune colonne/valeur Stripe, ne touche pas
  `webhook.ts`. Confirmé par relecture ligne à ligne (voir
  `PRE_RECETTE_CHECKLIST.md` §3).
- **Collision de contraintes** : le nouvel index
  `subscriptions_provider_subscription_id_key` porte un nom distinct
  de la contrainte `UNIQUE` existante sur `stripe_subscription_id`
  (`subscriptions_stripe_subscription_id_key`, auto-générée) —
  confirmé, aucune collision.
- **Changement destructif** : aucun `DROP COLUMN`, aucun `DELETE`,
  aucune contrainte resserrée. Seules opérations : `DROP NOT NULL`
  (assouplissement), `ADD COLUMN` (nullable ou avec défaut), `CREATE
  TABLE`/`CREATE INDEX` (nouveaux objets).
- **État des webhooks actuels** : `src/routes/api/public/payments/webhook.ts`
  (Stripe) n'apparaît dans **aucun** commit de cette PR — inchangé
  caractère pour caractère depuis `main`. Le nouveau webhook RevenueCat
  (`revenuecat-webhook.ts`) est un fichier séparé, n'intercepte ni ne
  modifie le flux Stripe.

### Étapes prévues (à exécuter uniquement sur votre accord explicite)

```
supabase login
supabase link --project-ref btsazmbmslgghlgjkmkw
supabase migration list                       # confirmation finale avant d'agir
# --- votre accord requis ici avant de continuer ---
supabase db push                               # applique les deux migrations dans l'ordre du dépôt
supabase migration list                        # reconfirmation post-application
```

Puis revalidation immédiate (sondes REST identiques à celles du §1,
qui doivent maintenant renvoyer `200` au lieu de `404`/`42703`), et
vérification qu'un événement Stripe réel (ou un test webhook depuis le
dashboard Stripe) est toujours traité normalement.

**Non exécuté.**

## 4. Configurations externes restantes — checklist d'exécution

Détail complet dans `PRE_RECETTE_CHECKLIST.md` §5–§12. Ordre d'exécution
suggéré (les items suivants sont indépendants entre eux, mais chacun
bloque une partie précise de la recette) :

| # | Action | Bloque quoi en recette | Fait ? |
|---|---|---|---|
| 1 | `eas login` + `eas init` (écrit `extra.eas.projectId`) | Push (§13 de la recette) | ☐ |
| 2 | `eas credentials` (clé APNs) | Push réel sur device | ☐ |
| 3 | Projet RevenueCat créé + lié au bundle id | Premium (§12) | ☐ |
| 4 | App Store Connect : produit(s) d'abonnement créés | Premium | ☐ |
| 5 | RevenueCat : entitlement `premium` créé, produits attachés | Premium | ☐ |
| 6 | RevenueCat : offering "current" avec packages | Premium | ☐ |
| 7 | `mobile/.env` : `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` renseignée | Premium | ☐ |
| 8 | RevenueCat : webhook pointé + secret défini | Synchronisation Premium backend | ☐ |
| 9 | `.env` (racine) : `REVENUECAT_WEBHOOK_SECRET` renseignée | idem | ☐ |
| 10 | Apple Developer : capability Sign in with Apple activée | Auth Apple (§2) | ☐ |
| 11 | Supabase Dashboard : provider Apple activé | Auth Apple | ☐ |
| 12 | Supabase Dashboard : provider Google activé + redirect `lingo://auth-callback` | Auth Google (§3) | ☐ |
| 13 | Supabase Dashboard : provider SMS configuré | Auth téléphone (§4) | ☐ |

**Aucun secret affiché ici ni ailleurs — uniquement des noms de
variables et des actions.** Liste exacte des noms de variables `.env`
(sans valeurs) : `PRE_RECETTE_CHECKLIST.md` §12.

**Aucune configuration externe modifiée depuis cet environnement.**

## 5. Recette réelle — ordre d'exécution

Correspondance entre l'ordre demandé et les sections de
`RECETTE_IPHONE.md` :

```
auth → onboarding → amis → conversations → messages → traduction
→ quota → médias → QR → push → Premium → restauration → suppression de compte
```

| Bloc | Section `RECETTE_IPHONE.md` | Prérequis | Compte/appareil | Donnée de test | Dépendance externe |
|---|---|---|---|---|---|
| **Auth** | §1–4 (email, Apple, Google, téléphone) | Config §4.10–4.13 pour Apple/Google/SMS | 1 compte (email fonctionne sans config externe) | Email jetable, numéro de test | ⚙️ Apple/Google/SMS pour §2–4 uniquement ; §1 (email) testable immédiatement |
| **Onboarding** | §6 | Compte fraîchement créé | 1 compte | — | Aucune |
| **Amis** | §10 | 2 comptes créés au préalable | 👥 2 comptes | Pseudos distincts connus à l'avance | Aucune |
| **Conversations** (liste) | §7 | Au moins 1 conversation existante | 👥 2 comptes | — | Aucune |
| **Messages** | §8.1–8.2, 8.4–8.6 | Conversation ouverte | 1 compte suffit pour l'envoi ; 👥 pour la réception | Textes courts variés, un très long | Aucune |
| **Traduction** | §8.3 | 2 comptes avec langues différentes | 👥 obligatoire | Message dans la langue de A, à lire traduit par B | Aucune (moteur déjà configuré côté web/backend) |
| **Quota** | Vérifié en creux via §8, §12.7 | Compte non-Premium | 1 compte | Dépasser volontairement la limite gratuite pour voir le blocage | Aucune |
| **Médias** | §9 | Permissions caméra/photothèque/micro | 👥📱 pour vérifier la réception | 1 photo, 1 enregistrement vocal court | Aucune |
| **QR** | §5 | Compte A connecté sur un appareil | 📱📱 2 appareils | QR généré en Profil sur A | Aucune |
| **Push** | §13 | Étapes 1–2 + 8–9 du §4 ci-dessus faites, migration Push appliquée | 👥📱 2 comptes/appareils | Message de A vers B, app de B fermée | ⚙️ EAS + APNs + migration |
| **Premium** | §12 | Étapes 3–9 du §4 ci-dessus faites, migration RevenueCat appliquée | 1 compte (+ 1 second pour §12.11 Stripe web) | Compte Sandbox App Store Connect | ⚙️ RevenueCat + App Store Connect + migration |
| **Restauration** | §12.9–12.10 | Achat déjà effectué | 1 compte, réinstallation de l'app | Même compte Sandbox | ⚙️ idem Premium |
| **Suppression de compte** | §11.6 | Un compte **jetable dédié**, jamais un compte principal | 1 compte jetable | Compte créé spécifiquement pour ce test | Aucune |

## 6. Tests multi-comptes — explicitement prévus

Chaque ligne suppose 2 comptes réels (👥) ou 2 appareils (📱📱) comme indiqué :

| Fonctionnalité | Où dans `RECETTE_IPHONE.md` | Ce qui est vérifié spécifiquement |
|---|---|---|
| Demande d'ami | §10.2–10.5 | Envoi par A, réception **et** action (accepter/refuser) par B, effet visible des deux côtés |
| Conversation | §7.3, §8 | Création accessible aux deux comptes une fois amis |
| Envoi/réception Realtime | §8.2–8.3 | Message envoyé par A apparaît chez B **sans action manuelle** (pas de pull-to-refresh) |
| Traduction | §8.3 | B voit une traduction dans **sa propre langue**, différente de celle de A |
| Présence | §8.7 | Statut en ligne de A reflété correctement côté B |
| Médias | §9.2 | Photo/vocal envoyés par A s'affichent/s'écoutent correctement chez B |
| Push | §13.4–13.8 | B reçoit une notification pour un message de A ; **A n'en reçoit jamais pour son propre message** (§13.8, à vérifier explicitement, pas supposé) |
| QR/device-link | §5.2–5.3 | Le second appareil se connecte au compte affiché par le premier, sans mot de passe |

## 7. Premium — test complet

| Étape | Où | Ce qui distingue "code prêt" de "réellement validé" |
|---|---|---|
| Achat mobile | §12.3–12.5 | Code prêt (typecheck + build OK) ≠ un sheet StoreKit réel n'a jamais été ouvert |
| Statut Premium côté mobile | §12.7 | `GET /api/quota` fonctionne déjà pour les comptes Stripe existants ; jamais vérifié après un achat RevenueCat réel |
| Statut Premium côté backend | §12.6 | Le webhook a 11 tests unitaires (mocks) ; jamais reçu un vrai événement RevenueCat |
| Statut Premium reconnu sur le web | §12.8 | Le correctif `useSubscription.ts` est confirmé par lecture de code ; jamais vérifié avec une vraie ligne `provider='revenuecat'` en base |
| Restauration après réinstallation | §12.10 | Code prêt (`Purchases.restorePurchases()`) ; jamais exécuté |
| Stripe web toujours fonctionnel pour un compte Premium web | §12.11 | Le webhook Stripe n'a pas été modifié (garantie par le diff Git) ; à revérifier en conditions réelles après application de la migration RevenueCat, par principe et non parce qu'un risque spécifique a été identifié |

## 8. Distinction explicite — ne rien déclarer "validé" par simple compilation

| État | Signifie | Ne signifie PAS |
|---|---|---|
| **Code prêt** | Compile (`tsc`), passe le lint/typecheck, testé unitairement avec des mocks, build iOS natif réussi, écran atteint sans crash au lancement | Que la fonctionnalité marche avec de vraies données/API externes |
| **Environnement configuré** | La configuration externe (dashboard, produit, credential) existe et est correctement renseignée | Que le flux de bout en bout a été exécuté avec succès |
| **Test réel passé** | Exécuté sur iPhone physique, avec de vraies données, un vrai réseau, et — quand nécessaire — un second compte/appareil, résultat conforme à l'attendu | — (c'est le seul niveau qui vaut "validé") |

**État actuel de chaque grand bloc, sur cette échelle :**

| Bloc | Code prêt | Environnement configuré | Test réel passé |
|---|---|---|---|
| Auth email/mdp | ✅ | ✅ (aucune config externe requise) | ❌ |
| Auth Apple/Google/téléphone | ✅ | ❌ (voir §4) | ❌ |
| Onboarding, Amis, Conversations, Messages, Traduction, Quota, Médias, QR | ✅ | ✅ (aucune config externe requise) | ❌ |
| Push | ✅ | ❌ (EAS, APNs, migration) | ❌ |
| Premium/IAP | ✅ | ❌ (RevenueCat, App Store Connect, migration) | ❌ |

Rien dans cette PR n'est actuellement au niveau "test réel passé" —
c'est précisément l'objet de la recette à venir.

---

*Ce document répond à la demande "vérification réelle avant recette".
Aucune migration, aucun rollback, aucune configuration externe n'ont
été exécutés en le préparant. PR #2 toujours Draft, non fusionnée.*
