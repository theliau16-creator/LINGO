# Phase 12 — Checklist pré-recette (Git → environnements réels)

Audit de ce qui existe dans le dépôt (`feature/mobile-v1`) mais n'est pas
encore appliqué/configuré dans les environnements réels (base Supabase
distante, App Store Connect, RevenueCat, Apple Developer, Google Cloud,
SMS provider). Aucune migration poussée, aucun produit App Store créé,
aucune configuration externe modifiée en préparant ce document — audit
seul, à votre demande explicite.

Fichier compagnon : [`RECETTE_IPHONE.md`](./RECETTE_IPHONE.md) (plan de
recette écran par écran).

---

## 1. Migrations Supabase non appliquées — confirmation officielle obtenue

**Correction de contexte importante :** Lingo utilise le backend
intégré **Lovable Cloud**, pas un projet Supabase externe rattaché à
un compte Supabase personnel. Le project ref backend n'a donc aucune
raison d'apparaître dans `supabase projects list` d'un compte
personnel — ce n'était pas une anomalie d'accès à corriger en
changeant de compte/en invitant une adresse dans une organisation
Supabase, seulement une mauvaise hypothèse de ma part sur la nature du
backend. **`supabase link`/`supabase migration list` ne doivent plus
être tentés sur un compte Supabase personnel pour ce projet.**

Avant cette clarification, ce document s'appuyait sur un sondage
indirect via l'API REST publique (lecture d'un échantillon de
tables/colonnes) — utile mais explicitement qualifié de non-exhaustif.
**Une vérification directe en lecture seule de la vraie base Lovable
Cloud a depuis été effectuée sur `supabase_migrations.schema_migrations`**
(la table interne que Supabase/Postgres utilise pour tracer l'historique
réel des migrations appliquées) — c'est la source faisant autorité,
supérieure au sondage REST par table.

**Résultat exhaustif, confirmé officiellement :**

| Migration | État réel confirmé |
|---|---|
| 26 migrations historiques (`20260806042707` → `20260810210705`) | ✅ **Toutes enregistrées comme appliquées** dans `supabase_migrations.schema_migrations` |
| `20260818150000` — Push (`device_tokens`, `messages.push_notified_at`) | ❌ **Non appliquée** |
| `20260818160000` — RevenueCat (`subscriptions.provider*`, `processed_revenuecat_events`) | ❌ **Non appliquée** |

Aucune divergence : ni migration manquante inattendue parmi les 26
historiques, ni migration présente côté base sans fichier correspondant
dans `supabase/migrations/`. La situation est exactement celle prévue
depuis la Phase 10 : **seules Push et RevenueCat restent à appliquer**,
dans cet ordre.

**Prochaine étape** (voir aussi `PLAN_EXECUTION_PHASE12.md` §1–2) :
vérifier le mécanisme de sauvegarde/restauration disponible côté
Lovable Cloud (backup automatique, snapshot, ou équivalent PITR) —
vérification que vous effectuez séparément dans le Dashboard Lovable
Cloud — puis préparer (sans l'exécuter) l'application des deux
migrations via l'environnement Lovable Cloud approprié.

## 2. Ordre d'application — Push puis RevenueCat

Supabase applique les migrations dans l'ordre de leur préfixe
horodaté. `150000` (Push) précède `160000` (RevenueCat) — l'ordre du
dépôt est donc déjà correct, aucune action requise.

**Les deux migrations sont mutuellement indépendantes** (vérifié en
relisant les deux fichiers) :
- Push touche `messages` (ajout de colonne) et crée `device_tokens`.
- RevenueCat touche `subscriptions` (ajout de colonnes + `DROP NOT
  NULL`) et crée `processed_revenuecat_events`.
- Aucune table, contrainte, index ou nom en commun entre les deux —
  elles pourraient être appliquées dans n'importe quel ordre, ou même
  séparément à des moments différents, sans risque d'interférence.

## 3. Risques pour les données Stripe/`subscriptions` existantes

Relecture ligne par ligne de `20260818160000_...sql` :

- `ALTER COLUMN stripe_customer_id/stripe_subscription_id/price_id DROP
  NOT NULL` — opération de métadonnées pure en PostgreSQL (pas de
  réécriture de table, pas de verrou long), et **aucune ligne existante
  n'est modifiée** : les valeurs Stripe déjà en base restent identiques,
  seule la contrainte future change.
- `ADD COLUMN provider ... DEFAULT 'stripe'` — ajout de colonne avec
  défaut constant : en PostgreSQL 11+, ceci n'entraîne pas non plus de
  réécriture de table. Toutes les lignes existantes reçoivent
  automatiquement `provider = 'stripe'`.
- `UPDATE ... SET provider_customer_id = stripe_customer_id, ...` —
  n'ajoute que des valeurs dans des colonnes par ailleurs vides
  (`WHERE provider_subscription_id IS NULL`), ne touche à aucune
  colonne Stripe existante, ne supprime rien.
- Le nouvel index `subscriptions_provider_subscription_id_key` porte un
  nom distinct de la contrainte `UNIQUE` déjà existante sur
  `stripe_subscription_id` (nommée automatiquement
  `subscriptions_stripe_subscription_id_key` par Postgres à la création
  de la table) — **aucune collision de nom**.
- `src/routes/api/public/payments/webhook.ts` (webhook Stripe) n'est
  touché par **aucun** commit de cette PR — son upsert
  (`onConflict: "stripe_subscription_id"`) continue de fonctionner à
  l'identique après la migration.
- `is_premium_user()` n'a nécessité aucune modification : sa logique ne
  lit que `status`/`current_period_end`, jamais les colonnes Stripe —
  elle continue de fonctionner pour les lignes Stripe exactement comme
  avant.

**Conclusion : risque techniquement nul pour les données Stripe
existantes.** Migration strictement additive, aucune donnée supprimée
ou réécrite, aucun webhook ni fonction Stripe modifié.

Seule réserve non liée aux données : le **temps d'indisponibilité** du
`ALTER TABLE` est négligeable (métadonnées uniquement) mais toute
migration prend un verrou bref — à appliquer hors pic de trafic par
prudence standard, pas parce qu'un risque spécifique a été identifié.

## 4. Sauvegarde / rollback recommandé avant migration

Aucune des deux migrations n'est destructive, mais par principe avant
toute migration sur une base de production :

1. **Snapshot / Point-in-Time Recovery** : si le plan Supabase du
   projet inclut le PITR, notez l'heure exacte avant application (permet
   de restaurer à cet instant précis en cas de problème imprévu). Sinon,
   `pg_dump` au minimum des tables `subscriptions` et
   `processed_stripe_events` avant de commencer.
2. **Rollback manuel possible** si nécessaire après coup (nouvelles
   migrations non fournies dans cette PR — à écrire seulement si un
   vrai besoin apparaît) :
   ```sql
   -- Annule 20260818160000 (RevenueCat) :
   DROP TABLE IF EXISTS public.processed_revenuecat_events;
   DROP INDEX IF EXISTS public.subscriptions_provider_subscription_id_key;
   DROP INDEX IF EXISTS public.subscriptions_provider_idx;
   ALTER TABLE public.subscriptions
     DROP COLUMN IF EXISTS provider,
     DROP COLUMN IF EXISTS provider_customer_id,
     DROP COLUMN IF EXISTS provider_subscription_id;
   -- Remettre NOT NULL suppose qu'aucune ligne RevenueCat n'a été
   -- insérée entre-temps (sinon ces colonnes contiennent des NULL) :
   ALTER TABLE public.subscriptions
     ALTER COLUMN stripe_customer_id SET NOT NULL,
     ALTER COLUMN stripe_subscription_id SET NOT NULL,
     ALTER COLUMN price_id SET NOT NULL;

   -- Annule 20260818150000 (Push) :
   DROP TABLE IF EXISTS public.device_tokens;
   ALTER TABLE public.messages DROP COLUMN IF EXISTS push_notified_at;
   ```
   Ce bloc est fourni à titre **informatif seulement** — non testé, non
   inclus dans `supabase/migrations/`, à valider avant tout usage réel.
3. Testez d'abord sur un environnement non-production si vous en avez
   un (projet Supabase de staging, ou `supabase db branch` si votre
   plan le permet).

## 5. EAS projectId

**Absent** — aucun `eas.json` dans le dépôt, `app.json` n'a pas
d'`extra.eas.projectId`. Bloque `Notifications.getExpoPushTokenAsync`
(Phase 10) ; le code no-op proprement (log, pas de crash) tant que ce
n'est pas fait.

Procédure (documentée dans le rapport Phase 10, rappelée ici) :
```
cd mobile
npx eas login      # si pas déjà connecté
npx eas init       # crée/lie le projet EAS, écrit extra.eas.projectId
npx expo run:ios   # rebuild pour que le nouveau projectId soit lu
```

## 6. Credentials APNs

**Non configurés.** Ce projet build en local (`expo run:ios`), pas via
EAS Build — la documentation Expo est explicite : *« If you are not
using EAS Build, run `eas credentials` manually »*.
```
cd mobile
npx eas credentials   # iOS → Push Notifications → générer/uploader une clé APNs
```
Nécessite un compte Apple Developer payant. L'entitlement
`aps-environment` lui-même est **déjà généré automatiquement** par le
plugin `expo-notifications` à chaque prebuild (vérifié dans
`mobile/ios/Lingo/Lingo.entitlements` — `development`) : aucune action
Xcode manuelle nécessaire pour ça spécifiquement.

## 7. Configuration RevenueCat

**Non configurée.** Éléments nécessaires (détaillés dans le rapport
Phase 11) :
- Projet RevenueCat créé sur app.revenuecat.com, lié à l'app iOS
  (bundle id `com.anonymous.lingo`).
- Entitlement nommé **exactement** `premium` (constante
  `PREMIUM_ENTITLEMENT_ID` dans `mobile/lib/revenuecat.ts`).
- Clé API publique iOS → `mobile/.env` (`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`).
- Webhook RevenueCat → `<domaine>/api/public/payments/revenuecat-webhook`,
  en-tête `Authorization` défini dans le dashboard = valeur de
  `REVENUECAT_WEBHOOK_SECRET` côté serveur.

## 8. App Store Connect — produit Premium + entitlement/offering

**Non configuré.** Dans l'ordre logique :
1. App Store Connect : créer le(s) produit(s) d'abonnement (ex.
   mensuel/annuel) — nécessite l'acceptation des accords de vente en
   cours sur le compte développeur.
2. RevenueCat dashboard : importer/déclarer ces mêmes produits.
3. RevenueCat dashboard : attacher les produits à l'entitlement
   `premium` (§7).
4. RevenueCat dashboard : créer une *offering* marquée « current »
   contenant les *packages* correspondants — sans ça,
   `Purchases.getOfferings()` renvoie `current: null` et le paywall
   mobile affiche « Aucun forfait disponible » (comportement déjà géré
   proprement dans `premium.tsx`, pas un crash, mais rien n'est
   achetable tant que ce n'est pas fait).
5. Optionnel pour tester en local sans sandbox App Store : fichier de
   configuration StoreKit (`.storekit`) ajouté au schéma Xcode — pas
   fait ici (nécessite Xcode, hors des outils disponibles dans cet
   environnement).

## 9. Sign in with Apple

**Non confirmé activé.** Deux réglages distincts nécessaires :
- Apple Developer portal : capability **"Sign in with Apple"** activée
  pour le bundle id `com.anonymous.lingo`.
- Supabase Dashboard → Authentication → Providers : provider **Apple**
  activé.

Le code (`mobile/lib/use-oauth.ts`, `expo-apple-authentication`) est
prêt et ne nécessite aucun changement une fois ces deux réglages faits.

## 10. Google OAuth

**Non confirmé activé.** Deux réglages :
- Supabase Dashboard → Authentication → Providers : provider **Google**
  activé (nécessite un client OAuth Google Cloud configuré côté
  Supabase — Client ID/Secret Google, gérés entièrement dans le
  dashboard Supabase, jamais dans ce dépôt).
- Supabase Dashboard → Authentication → URL Configuration : redirect
  URL **`lingo://auth-callback`** ajoutée à la liste autorisée.

## 11. Phone Auth / SMS

**Non confirmé configuré**, et c'est le seul des trois canaux d'auth
supplémentaires où rien dans le dépôt n'indique qu'un provider SMS a
jamais été branché (Twilio/MessageBird/Vonage…), même côté web.
Supabase Dashboard → Authentication → Phone : provider SMS à
configurer. Sans ça, `supabase.auth.signInWithOtp({phone})` échouera à
l'envoi (le code mobile, `mobile/app/phone-auth.tsx`, gère déjà cette
erreur proprement — message d'échec affiché, pas de crash).

## 12. Variables `.env` nécessaires (noms uniquement, aucun secret ici)

**Racine du dépôt** (`.env`, serveur — voir `.env.example`) :
```
SUPABASE_URL
SUPABASE_PROJECT_ID
SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY          # secret serveur
VITE_PAYMENTS_CLIENT_TOKEN
STRIPE_SANDBOX_API_KEY             # secret serveur
STRIPE_LIVE_API_KEY                # secret serveur
PAYMENTS_SANDBOX_WEBHOOK_SECRET    # secret serveur
PAYMENTS_LIVE_WEBHOOK_SECRET       # secret serveur
LOVABLE_API_KEY                    # secret serveur
DEEPL_API_KEY                      # secret serveur, optionnel
GOOGLE_TRANSLATE_API_KEY           # secret serveur, optionnel
EXPO_ACCESS_TOKEN                  # secret serveur, optionnel (Phase 10)
REVENUECAT_WEBHOOK_SECRET          # secret serveur (Phase 11)
```

**Mobile** (`mobile/.env`, embarqué dans le client — voir
`mobile/.env.example`, aucune valeur n'est un secret par construction) :
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY   # Phase 11
```

Aucune valeur affichée ici, uniquement les noms — cohérent avec la
consigne. Les fichiers `.env.example` correspondants sont déjà à jour
dans le dépôt et servent de référence exacte.

## 13. Ce qui nécessite absolument un iPhone réel

Le simulateur de cet environnement a un input tactile non fonctionnel
(limitation de l'outil, documentée depuis la Phase 1) — tout ce qui
suit est donc **entièrement non testé**, pas seulement "à revérifier" :

- Toute interaction tactile en général (formulaires, boutons, listes) —
  conséquence directe de la limitation ci-dessus.
- Clavier fiable pour saisie manuelle (email, mot de passe, messages).
- Sign in with Apple : le sheet natif nécessite un vrai Face/Touch ID
  ou code appareil.
- Permission caméra réelle + scan QR réel (lecture d'un code affiché
  sur un autre écran).
- Permission microphone réelle + enregistrement/lecture de messages
  vocaux.
- Permission notifications réelle + réception effective d'un push
  **app fermée ou en arrière-plan** (le simulateur peut recevoir des
  push depuis Xcode 14+/iOS 16+, mais la chaîne complète Expo Push →
  APNs → device physique n'est validée qu'avec du matériel réel et de
  vrais credentials APNs).
- Achat StoreKit réel (nécessite un compte testeur Sandbox App Store,
  configuré dans App Store Connect, connecté sur l'appareil).
- Tap sur une notification pour rouvrir l'app depuis l'état
  fermé/arrière-plan.
- Deep link déclenché depuis une app externe (Mail, Messages, Safari)
  vers `lingo://...`.
- Toute mesure de performance/fluidité réelle (le simulateur ne reflète
  pas les performances d'un appareil physique).

## 14. Ce qui nécessite deux comptes ou deux appareils

- Envoi/réception de message en temps réel (Realtime) entre deux
  utilisateurs distincts — **impératif avant toute release**, jamais
  vérifié de bout en bout jusqu'ici.
- Traduction automatique : vérifier qu'un message écrit par le compte A
  dans sa langue s'affiche traduit pour le compte B dans la sienne.
- Demandes d'ami (envoi depuis A, réception/acceptation par B).
- QR / device-link : le QR est affiché sur un appareil déjà connecté
  (compte A) et scanné par un second appareil (pour se connecter en
  tant que A, ou comme compte B selon le scénario testé) — nécessite
  physiquement deux appareils ou un appareil + un écran web affichant
  le QR.
- Blocage/déblocage d'un contact (l'effet ne se vérifie complètement
  qu'en observant les deux côtés : le bloqueur et le bloqué).
- Notification push : vérifier que l'**expéditeur** d'un message ne
  reçoit jamais de push pour son propre message, alors que le
  **destinataire** en reçoit un — nécessite un second compte/appareil
  pour observer les deux comportements attendus simultanément.
- Groupes (si testés) : ajout/retrait de membres, rôles admin —
  nécessite plusieurs comptes.

---

*Document d'audit — Phase 12. Ne remplace pas une vérification directe
de l'état réel de la base et des dashboards externes ; signale
précisément où regarder et quoi faire, sans y avoir accès depuis cet
environnement.*
