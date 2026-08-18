# Sauvegarde logique avant migrations Push + RevenueCat

Plan uniquement — **rien n'a été exécuté**. Aucune migration poussée,
aucune donnée exportée, aucune configuration modifiée. Lovable Cloud
Test+Live n'étant pas disponible pour ce projet (créé après le
24/03/2026), aucun mécanisme de backup automatique avant publication
ne doit être supposé : la sauvegarde ci-dessous est manuelle, logique,
et à exécuter par vous via l'interface Lovable Cloud (SQL editor/Table
editor — je n'ai pas d'accès en écriture ni de clé service-role depuis
cet environnement pour l'exécuter moi-même).

## Règles — à respecter à chaque exécution de ce plan

1. **Les exports réels de `subscriptions` ne doivent jamais être
   commités dans Git** — ni le fichier de données complet (§3), ni la
   capture de structure (§4). Ce sont des données de production
   (identifiants Stripe réels) : à conserver strictement en dehors du
   dépôt.
2. **Noter l'heure exacte de l'export et le nombre total de lignes**
   à chaque export — sert de référence pour le contrôle de
   cohérence (§5) et pour savoir si des écritures ont pu intervenir
   entre l'export et la migration (§6).
3. **Conserver l'export dans un emplacement local sécurisé**, jamais
   dans un dossier synchronisé/partagé publiquement, jamais collé
   dans un outil tiers non maîtrisé (ticket, chat non chiffré, etc.).
4. **Après la migration RevenueCat, vérifier que `stripe_customer_id`,
   `stripe_subscription_id` et `price_id` sont strictement inchangés**
   pour chaque ligne préexistante — comparaison directe avec l'export
   du §3, pas une simple relecture du SQL.
5. **Vérifier que les nouvelles colonnes génériques backfillées
   (`provider_customer_id`, `provider_subscription_id`) correspondent
   exactement aux anciennes valeurs Stripe** (`stripe_customer_id`,
   `stripe_subscription_id`) pour toutes les lignes concernées — pas
   une vérification par sondage, une comparaison ligne à ligne.

Ces cinq règles sont reprises et détaillées dans les sections
correspondantes ci-dessous (§3–§6).

---

## 1. Données existantes précisément touchées

Relecture exhaustive des deux fichiers (rien de nouveau par rapport à
la Phase 12, reconfirmé ligne à ligne) :

### Migration Push — `20260818150000_b740543a-...sql`

| Objet | Type d'opération | Donnée existante touchée ? |
|---|---|---|
| `public.messages` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS push_notified_at timestamptz` | **Non** — nouvelle colonne nullable, aucune valeur par défaut non-nulle, aucun `UPDATE` dans le fichier |
| `public.device_tokens` | `CREATE TABLE` (nouvelle table, vide) | **Non** — table inexistante avant, donc aucune donnée préexistante |
| Index, policy, trigger sur `device_tokens` | Nouveaux objets | **Non** — portent sur une table qui vient d'être créée |

### Migration RevenueCat — `20260818160000_5c14afb7-...sql`

| Objet | Type d'opération | Donnée existante touchée ? |
|---|---|---|
| `public.subscriptions.stripe_customer_id` | `ALTER COLUMN DROP NOT NULL` | Contrainte assouplie, **valeurs existantes inchangées** |
| `public.subscriptions.stripe_subscription_id` | `ALTER COLUMN DROP NOT NULL` | idem |
| `public.subscriptions.price_id` | `ALTER COLUMN DROP NOT NULL` | idem |
| `public.subscriptions.provider` | `ADD COLUMN ... NOT NULL DEFAULT 'stripe'` | **Oui** — chaque ligne existante reçoit la valeur `'stripe'` (écriture réelle, uniforme) |
| `public.subscriptions.provider_customer_id` | `ADD COLUMN` (nullable) | Non à l'ajout ; **oui** ensuite via l'`UPDATE` ligne suivante |
| `public.subscriptions.provider_subscription_id` | `ADD COLUMN` (nullable) | idem |
| `UPDATE public.subscriptions SET provider_customer_id = stripe_customer_id, provider_subscription_id = stripe_subscription_id WHERE provider = 'stripe' AND provider_subscription_id IS NULL` | `UPDATE` explicite | **Oui, la seule vraie écriture de données existantes de toute la PR** — copie les colonnes Stripe existantes vers les nouvelles colonnes génériques, sur chaque ligne Stripe actuelle |
| `subscriptions_provider_subscription_id_key`, `subscriptions_provider_idx` | `CREATE INDEX` | Non — nouveaux index |
| `public.processed_revenuecat_events` | `CREATE TABLE` (nouvelle table, vide) | Non |

**Conclusion §1 :** une seule opération de toute la PR écrit réellement
dans des lignes existantes : le backfill `UPDATE` de la migration
RevenueCat sur `subscriptions`. C'est pourquoi la priorité de
sauvegarde porte spécifiquement sur cette table, avant cette migration.

## 2. Confirmation — Push ne modifie aucune donnée existante

Confirmé, deux fois indépendamment :
- **Lecture du SQL** (ci-dessus) : le fichier ne contient ni `UPDATE`
  ni `DELETE`, uniquement un `ALTER TABLE ... ADD COLUMN` (nullable,
  sans défaut non-nul) et un `CREATE TABLE`.
- **Comportement PostgreSQL** : `ADD COLUMN` sans `DEFAULT` non-volatil
  ne réécrit pas la table et remplit la nouvelle colonne à `NULL` pour
  toutes les lignes existantes — aucune valeur d'aucune colonne
  existante n'est lue ni modifiée.

**La migration Push peut être appliquée sans sauvegarde de données
préalable spécifique** (au-delà de la prudence générale de disposer
d'un export récent, cf. §3). Aucune table ni colonne existante
n'entre en jeu.

## 3. Export complet de `subscriptions` avant RevenueCat

À exécuter par vous dans le SQL editor de Lovable Cloud (ou le Table
editor si un export CSV y est proposé) **avant** d'appliquer la
migration RevenueCat :

```sql
-- Export complet, ordonné pour un diff reproductible
SELECT *
FROM public.subscriptions
ORDER BY created_at, id;
```

Récupérez le résultat complet (bouton export CSV/JSON du SQL editor
si disponible, sinon copier le résultat affiché en entier — vérifiez
qu'aucune pagination ne tronque les lignes). Conservez ce fichier hors
du dépôt Git (ne jamais committer de données de production, même sans
secret à proprement parler — `stripe_customer_id`/`stripe_subscription_id`
sont des identifiants Stripe réels).

En complément, un résumé de contrôle (léger, sert de somme de
vérification indépendante du fichier complet — §5) :

```sql
SELECT
  count(*)                                            AS total_rows,
  count(*) FILTER (WHERE status = 'active')            AS active,
  count(*) FILTER (WHERE status = 'trialing')           AS trialing,
  count(*) FILTER (WHERE status = 'canceled')            AS canceled,
  count(*) FILTER (WHERE status = 'past_due')             AS past_due,
  count(DISTINCT stripe_customer_id)                       AS distinct_stripe_customers,
  count(DISTINCT stripe_subscription_id)                    AS distinct_stripe_subscriptions,
  min(created_at)                                            AS oldest_row,
  max(created_at)                                             AS newest_row
FROM public.subscriptions;
```

## 4. Sauvegarde de la structure actuelle de `subscriptions`

Capturer la définition exacte avant migration, pour comparaison
après coup (§6). Quatre requêtes, à exécuter et conserver le résultat
texte de chacune :

```sql
-- Colonnes (nom, type, nullable, défaut)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'subscriptions'
ORDER BY ordinal_position;

-- Contraintes (PK, UNIQUE, CHECK, FK) avec leur définition complète
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.subscriptions'::regclass
ORDER BY conname;

-- Index
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'subscriptions'
ORDER BY indexname;

-- Policies RLS
SELECT polname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'subscriptions';

-- Grants (qui peut faire quoi)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'subscriptions'
ORDER BY grantee, privilege_type;
```

Conserver ces cinq résultats (colonnes, contraintes, index, policies,
grants) dans un fichier texte horodaté, à côté de l'export de données
du §3 — **hors du dépôt Git**.

## 5. Vérifier que la sauvegarde est exploitable

Avant de considérer la sauvegarde fiable :

1. **Le compte de lignes de l'export (§3) correspond au résumé de
   contrôle** exécuté au même moment (`total_rows` de la requête
   résumé = nombre de lignes du fichier d'export complet). S'ils ne
   correspondent pas, l'export a probablement été tronqué (pagination)
   — à refaire.
2. **Contrôle ponctuel** : choisissez 2–3 lignes au hasard dans
   l'export complet (idéalement des `stripe_subscription_id`
   reconnaissables) et vérifiez que toutes leurs colonnes sont
   cohérentes avec ce que vous savez de ces abonnements par ailleurs
   (statut, date).
3. **Le fichier s'ouvre correctement** dans l'outil prévu pour le
   relire (éditeur de texte/tableur) — un export corrompu ou mal
   échappé (virgules dans des valeurs, encodage) se détecte à ce
   stade, pas après coup.
4. **La capture de structure (§4) est complète** : cinq sections
   présentes (colonnes, contraintes, index, policies, grants), aucune
   requête n'a renvoyé une erreur silencieusement ignorée.
5. **Horodatage noté** : le moment exact de l'export, pour savoir si
   des écritures Stripe (webhook) ont pu intervenir entre l'export et
   l'application de la migration (fenêtre courte à privilégier).

Si l'un de ces points échoue, la sauvegarde n'est pas exploitable —
recommencer avant de continuer.

## 6. Contrôles immédiatement après chaque migration

### Après la migration Push

- Ré-exécuter les sondes REST déjà utilisées en Phase 12 :
  `device_tokens` et `messages.push_notified_at` doivent passer de
  `404`/`400` (`PGRST205`/`42703`) à `200`.
- `SELECT count(*) FROM public.messages;` — le compte doit être
  **strictement identique** à avant migration (aucune ligne
  ajoutée/supprimée, seule une colonne a été ajoutée).
- Vérifier qu'un message peut toujours être envoyé normalement côté
  web/mobile (l'ajout de colonne ne doit rien changer au comportement
  applicatif existant).

### Après la migration RevenueCat

- Ré-exécuter les sondes REST : `processed_revenuecat_events`,
  `subscriptions.provider`, `subscriptions.provider_subscription_id`
  doivent passer à `200`.
- **Comparer le compte de lignes** : ré-exécuter le résumé de
  contrôle du §3 — `total_rows` doit être **identique** au chiffre
  d'avant migration (la migration ne fait qu'`UPDATE`, jamais
  `INSERT`/`DELETE`). Toute différence = signal d'alerte immédiat,
  ne pas continuer, investiguer avant toute autre action.
- **[Règle 4] `stripe_customer_id`/`stripe_subscription_id`/`price_id`
  strictement inchangés** : ré-exporter `subscriptions` (même requête
  qu'au §3) et comparer directement, ligne à ligne, avec l'export
  pré-migration — ces trois colonnes ne doivent différer sur **aucune**
  ligne. Étendre la même comparaison à `status`, `current_period_end`,
  `current_period_start`, `cancel_at_period_end`, `product_id`,
  `environment` (aucune n'est censée avoir changé non plus).
- **[Règle 5] Backfill exact** : pour chaque ligne pré-existante,
  vérifier `provider = 'stripe'` **et** `provider_customer_id =
  stripe_customer_id` **et** `provider_subscription_id =
  stripe_subscription_id` — comparaison ligne à ligne contre l'export
  du §3, pas un sondage sur quelques lignes. Un seul écart = le
  backfill n'a pas fonctionné comme prévu, à investiguer avant de
  continuer.
- **Comparer la structure** : ré-exécuter les cinq requêtes du §4 et
  differ avec la capture pré-migration — seuls les changements
  décrits dans le fichier de migration doivent apparaître (colonnes
  `provider*` ajoutées, contraintes `NOT NULL` assouplies sur les 3
  colonnes Stripe, 2 nouveaux index) ; **rien d'autre** ne doit
  différer (aucune contrainte Stripe supprimée, aucune policy
  modifiée en dehors de ce qui est prévu).
- **Webhook Stripe toujours fonctionnel** : déclencher un événement
  de test depuis le dashboard Stripe (ou attendre le prochain
  événement réel) et confirmer qu'il continue à créer/mettre à jour
  une ligne normalement — le code du webhook n'a pas changé, mais
  c'est le seul test qui valide le comportement réel post-migration,
  pas seulement la lecture du diff de code.
- **`is_premium_user()` toujours correct** : vérifier qu'un compte
  connu comme Premium via Stripe est toujours reconnu Premium après
  la migration (`GET /api/quota` ou équivalent).

---

*Plan uniquement. Aucune migration poussée, aucune donnée exportée,
aucune configuration modifiée, aucun secret affiché. En attente de
votre accord avant toute exécution.*
