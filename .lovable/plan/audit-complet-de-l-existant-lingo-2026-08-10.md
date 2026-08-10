# Audit complet de l'existant — Lingo

Audit **lecture seule**. Aucun fichier, table, policy, secret ou paramètre modifié. Aucune migration lancée.
Sources : code réel, base réelle en SELECT, `pg_policies`, `pg_indexes`, `storage.objects`, linter DB.

Légende de fiabilité : **[Vérifié DB]** = prouvé par requête SQL sur la base réelle · **[Code]** = prouvé par lecture du code · **[Inféré]** = déduction sans exécution · **[Non vérifié]** = impossible sans session authentifiée.

---

## 1. Architecture globale

TanStack Start v1 (routes fichier, SSR via `src/server.ts`, cible Cloudflare Worker), React 19, Supabase (Auth/Postgres/Realtime/Storage), Stripe, couche MCP.

Routes : `index`, `auth`, `join.$code`, `mcp` + `[.mcp]/*` + `[.well-known]/*`, `api/public/payments/webhook`, et sous `_authenticated/` : `chats`, `chat.$conversationId`, `friends`, `onboarding`, `profile`, `settings`, `premium`, `subscription`, `admin`.

Backend : `createServerFn` uniquement (pas d'edge functions), avec `requireSupabaseAuth` (validation du bearer + client RLS-scopé) et `supabaseAdmin` chargé en `await import()` dans les handlers.

**Propre** : séparation `.functions.ts` / `.server.ts` respectée ; middleware d'auth serveur correct ; CSRF réactivé explicitement dans `src/start.ts` ; cache de traduction en base avec contrainte unique.
**Fragile** : `chat.$conversationId.tsx` = 997 lignes mêlant outbox, realtime, traduction, médias, réactions, receipts ; couplage fort de tout le pipeline média/traduction à `supabaseAdmin` ; aucun test.
**Redondant** : 3 index quasi identiques sur `messages(conversation_id, created_at)` **[Vérifié DB]** ; logique « premium » dupliquée dans `quota.server.ts`, `admin.server.ts` et `useSubscription.ts`.

## 2. Authentification et comptes

- Email/mot de passe, OAuth Google/Apple via `lovable.auth`, OTP téléphone (cooldown 60 s), liaison d'appareil par QR (token 256 bits, TTL 2 min, usage unique) **[Code]**.
- Mot de passe oublié : `resetPasswordForEmail` présent, mais **aucune route/écran de définition du nouveau mot de passe** ; le lien de récupération renvoie sur `/auth` sans gestion de l'événement `PASSWORD_RECOVERY` **[Code]** → flux incomplet.
- Trigger `handle_new_user` crée `profiles` + `user_settings` ; **0 profil sans `user_settings`** **[Vérifié DB]** → anciens comptes non pénalisés.
- Rôles : table `user_roles` + `has_role()` SECURITY DEFINER ; `requireAdmin` est bien appliqué **côté serveur** dans `adminListAccounts` / `adminResetQuota` **[Code]**. 1 seule ligne dans `user_roles` **[Vérifié DB]**. Mode développeur = toggle localStorage conditionné à `isAdmin`.
- Reprise Safari : `autoRefreshToken` + refresh-and-retry-once sur erreur 401 dans l'envoi. **[Non vérifié]** en session réelle.

## 3. Messagerie texte

- DM 1:1 opérationnels **[Vérifié DB : 1 conversation `direct`, 28 messages]**. **Aucune conversation de type `group` n'existe en base** → le multilingue de groupe n'a jamais tourné en réel **[Vérifié DB]**.
- Outbox `localStorage` + `localId`, patch realtime dédupliqué par `id`, pagination par `limit` croissant (40), receipts upsert idempotents, reply, réactions, suppression pour moi / pour tous.
- **Risque doublon (Critique)** : `messages` n'a **aucune contrainte d'unicité applicative** (`messages_pkey`, FKs, `messages_author_present` uniquement) **[Vérifié DB]**, et l'`id` est généré côté serveur — le `localId` n'est jamais envoyé. La seule garde anti-doublon est un `Set` **en mémoire, par montage de composant**. Quatre déclencheurs de flush coexistent (montage, `online`, `visibilitychange`, intervalle 15 s) + un retry après refresh de session. Deux onglets, un remount, ou un insert réussi dont la réponse est perdue ⇒ message dupliqué **[Code + Vérifié DB pour l'absence de contrainte]**.
- **5 messages texte bloqués en `translation_status = 'pending'` depuis le 7–8 août** **[Vérifié DB]** : le correctif « stale > 60 s » n'agit que côté UI, il ne répare pas les lignes.
- Filtre de suppression `!deleted_at || deleted_at === null` = condition redondante/morte **[Code]**.

## 4. Traduction

- Pipeline : cache `(message_id, language)` → court-circuit même langue → quota → contexte (3 msgs, mode premium) → glossaire de conversation → `translateWithRouter` → upsert admin. Cache unique en base **[Vérifié DB : contrainte unique présente, 93 traductions, 0 orpheline]**.
- **Pas de détection de langue en texte** : `source_language` vient du profil de l'expéditeur.
- Fan-out séquentiel par langue de participant + langues des invités.
- **Quota** : `assertQuota` avant appel IA, `consumeQuota` après succès. Trois failles **[Code]** :
  1. `consumeQuota` fait lecture-puis-upsert, **non atomique** → sous-comptage en rafale ;
  2. les traductions déclenchées par un **vocal passent `quotaUserId = null`** → jamais facturées au quota ;
  3. deux appels concurrents sur la même paire (message, langue) passent tous deux le cache-check → **double appel IA payant**.
- Premium considéré actif pour les statuts `active, trialing, past_due, canceled` — `past_due` sans `current_period_end` = premium illimité indéfiniment **[Code]**.
- Aucun timeout ni backoff sur DeepL/Google/Lovable AI ; un seul fallback vers Lovable AI.
- `conversation_translation_memory` : toutes les lectures/écritures filtrent `conversation_id`, contrainte unique `(conversation_id, term, target_language)`, 4 policies RLS **[Vérifié DB]** → **pas de contamination inter-conversations détectée**.
- `confidence_score` / `alternative_translation` produits par Lovable AI seulement ; correction manuelle force `confidence = 1`, `engine = 'user'`.

## 5. Messages vocaux — cause racine trouvée

**[Vérifié DB]** 7 vocaux : 4 `completed`, **3 `failed` avec `Transcription indisponible (400)`**. Jointure `voice_messages` × `storage.objects` :

| chemin | mimetype réel | statut |
|---|---|---|
| `….webm` ×4 | `audio/webm` | completed |
| `….webm` ×3 | **`audio/mp4`** | **failed 400** |

**Cause racine (Critique, confiance élevée)** : Safari/iOS enregistre en `audio/mp4` mais le fichier est **uploadé avec une extension `.webm`**. Côté serveur, `audioFileName()` (`src/lib/media.server.ts:73-78`) dérive l'extension **prioritairement du chemin** — le STT reçoit donc `recording.webm` pour un conteneur MP4 et répond 400. Le correctif MIME de la session précédente porte sur le choix du codec, pas sur le nom du chemin d'upload. Les 3 échecs datent du 10 août 17 h 40, **après** le correctif.

Autres constats **[Code]** :
- `recoverStalledVoiceMessages` relance tout état non terminal > 60 s **sans verrou** : une transcription lente encore en vol peut être relancée → **double facturation STT** et course d'écriture.
- Upload storage effectué avant l'insert message ⇒ **audio/photo orphelins possibles**, aucun garbage collector. **[Vérifié DB]** aujourd'hui : 8 objets `chat-media` pour 7 vocaux + 1 image, pas d'orphelin.
- URL signée 3600 s / `staleTime` 50 min : marge faible mais acceptable.
- Polling 3 s par bulle vocale non terminale, sans backoff ni plafond.
- Limite 8 Mo appliquée **seulement à la transcription**, pas à l'upload.

## 6. Photos / Liens / Médias

- Bucket `chat-media` privé, SELECT via `is_participant(foldername[1], auth.uid())`, DELETE réservé au owner **[Vérifié DB]**.
- **SSRF (Haute)** : `assertSafeUrl` filtre lexicalement les hôtes privés puis `fetch(..., { redirect: "follow" })` **sans revalider la cible après redirection** → une URL publique redirigeant vers `127.0.0.1`/IP interne passe. Pas de protection DNS-rebinding ni IPv6-mapped.
- **DoS lecture (Moyenne)** : `await response.text()` télécharge tout le corps avant le `slice(0, 300 Ko)` ; seul le timeout 6 s borne l'exposition.
- Cache `link_previews` clé sur l'URL brute (pas de normalisation).
- **Pas de validation serveur du type ni de la taille des photos** : `attachments` du client accepté quasi tel quel.

## 7. QR / Invitations / Web sans installation

- Code d'invitation 10 car. / alphabet 32 (~50 bits), token guest 256 bits, **stocké uniquement en SHA-256** ; expiration, révocation et `max_uses` centralisés dans `loadValidInvite` **[Code]**.
- Guest strictement scopé : `conversation_id` provient de la ligne `guest_users`, jamais du client **[Code]**. RLS `guest_users` = 1 policy, INSERT/UPDATE/DELETE refusés aux clients **[Vérifié DB]**.
- Conversion guest→compte : réattribution des messages, `claimed_by`, backfill des traductions **[Code]**.
- Incrément de `uses` non atomique → léger dépassement possible de `max_uses`.
- Token guest en `localStorage` (exposé à un XSS éventuel).
- **[Vérifié DB] 0 invitation et 0 guest en base** ⇒ le parcours QR/lien/guest n'a **jamais été exécuté de bout en bout**.

## 8. Abonnements / Quotas / Stripe

- Webhook : signature HMAC vérifiée, tolérance 300 s, idempotence par `processed_stripe_events` (unique sur `event_id`) **[Code + Vérifié DB]**. Comparaison de signature non à temps constant (faiblesse mineure).
- Statuts abonnement, `past_due`, annulation, factures lues en direct chez Stripe (non répliquées).
- Moyens de paiement : Dynamic Payment Methods (Apple/Google Pay, Link, PayPal selon éligibilité) — **[Non vérifié]** en sandbox réelle.
- Quota gratuit 1 000 traductions, gate **réellement serveur** ✔.
- **[Vérifié DB] 0 abonnement en base** ⇒ aucun achat n'a jamais abouti ; le tunnel complet est **non vérifié**.
- Usage actuel : 2 comptes à 6 et 10 traductions **[Vérifié DB]**.

## 9. Personnalisation du chat

- `chat_preferences` : unicité `(user_id)` global + `(user_id, conversation_id)`, policy `ALL` sur `auth.uid() = user_id` **[Vérifié DB]**.
- Bucket `chat-backgrounds` : isolation par dossier `auth.uid()` **[Vérifié DB]**.
- **Paywall contournable (Haute)** : le gate Premium n'existe **que dans `ChatCustomizer`**. Ni la RLS ni un server fn ne vérifient l'abonnement → un appel direct à l'API permet à un compte gratuit de personnaliser **[Vérifié DB + Code]**.

## 10. Sécurité

- RLS activée sur **les 25 tables publiques** **[Vérifié DB]**. `processed_stripe_events` : RLS active, **0 policy** (verrouillée volontairement, correspond à l'INFO du linter).
- Linter : 1 INFO (RLS sans policy), 1 WARN extension en `public` (pg_trgm), **7 WARN fonctions SECURITY DEFINER exécutables par les utilisateurs connectés** — à réévaluer une par une (`create_direct_conversation` et `accept_friend_request` sont légitimes ; `has_role`, `is_participant`, `conversation_has_block`, `shares_conversation` n'ont pas besoin d'être exposées à PostgREST).
- IDOR : pas de faille applicative trouvée sur guests/invites/admin. Le principal risque de contournement est le paywall personnalisation (§9) et le quota vocal (§4).
- Secrets frontend : seules les clés publiables sont exposées **[Code]**.
- SSRF : confirmée via redirections (§6).
- Rate limiting : **inexistant** — envoi de messages, invitations, `linkPreview`, OTP téléphone, transcription : aucun garde-fou applicatif.
- RGPD : **aucun export de données, aucune suppression de compte** trouvée ; `translation_logs` conserve le texte original avec `user_id` ; pas de consentement explicite pour la mémoire de traduction. Blocage / sourdine / signalement présents (`blocked_users`, `muted_at`, `user_reports`).

## 11. Performance / scalabilité

- Index bien couverts sur les chemins chauds (`messages(conversation_id, created_at desc)`, `message_translations` unique, trigram sur `profiles.username`) **[Vérifié DB]**.
- **Index manquants probables** : `message_translations(message_id)` seul (couvert par l'unique composite, OK), `message_receipts(user_id)`, `voice_messages(conversation_id, transcription_status, updated_at)` (utilisé par le reaper), `translation_usage` OK, `conversation_participants(user_id)` **absent** — la requête « mes conversations » scanne la table.
- Pagination par `limit` croissant : refetch complet du préfixe, O(n) sur les longues conversations.
- Polling vocal 3 s + intervalle outbox 15 s + realtime : charge multipliée par onglet.
- Fan-out traduction séquentiel : latence ≈ N × latence IA en groupe multilingue ; contexte + glossaire re-requêtés pour chaque langue.
- À 1 000+ utilisateurs actifs : le coût IA des groupes et l'absence de rate limiting sont les deux premiers murs.

## 12. Mobile / PWA / iOS

- `manifest.webmanifest` présent, UI mobile-first, sélection de codec adaptée Safari.
- Reprise d'onglet gérée via `visibilitychange` (mais cf. risque doublon §3).
- Notifications push : service présent, **jamais validé**.
- Hors ligne : outbox texte uniquement (pas de file pour photos/vocaux).

## 13. Qualité / dette

Fichiers > 400 lignes : `chat.$conversationId.tsx` (997), `ui/sidebar.tsx` (744), `i18n.ts` (709), `settings.tsx` (417), `profile.tsx` (410).
`as any` : 24 (majoritairement fichiers générés + typage Stripe). `catch {}` intentionnels sans log (traductions guest, backfill) → aucune télémétrie en cas de panne du service de traduction. 2 `console.log` bénins (webhook Stripe). Feature flags purement client, sans contrepartie serveur.

## 14. Tests

**Aucun test automatisé** : pas de `*.test.*`, pas de config vitest/jest, pas de script de test. La seule assurance actuelle est typecheck + build.

Matrice de smoke tests prioritaire (à exécuter, pas à automatiser tout de suite) :
1. Envoi texte iOS Safari avec bascule avion/reprise → vérifier **absence de doublon** en base.
2. Deux onglets même conversation, envoi simultané → doublon ?
3. Vocal enregistré sur iPhone → vérifier extension du chemin vs mimetype réel + transcription.
4. Vocal > 60 s de traitement → vérifier qu'il n'y a qu'un seul appel STT.
5. Groupe 3 langues → 1 message, compter les lignes `message_translations` et l'incrément `translation_usage`.
6. Compte gratuit à quota épuisé → envoi texte puis vocal (le vocal doit-il passer ?).
7. Invitation QR → guest envoie/lit → conversion en compte.
8. Achat Stripe sandbox complet → webhook → `subscriptions` → quota illimité.
9. Compte gratuit appelant directement l'API `chat_preferences`.
10. `linkPreview` avec URL publique redirigeant vers `127.0.0.1`.

## 15. Base de données

25 tables, toutes en RLS. Volumes réels : `messages` 28, `message_translations` 93, `profiles` 4, `voice_messages` 7, `translation_usage` 2, `user_roles` 1, `conversations` 1 (`direct`), `guest_users` 0, `conversation_invites` 0, `subscriptions` 0 **[Vérifié DB]**.
Triggers : `handle_new_user` (auth), `bump_conversation`, `set_updated_at` sur 10 tables.
Orphelins : **0 traduction orpheline, 0 vocal orphelin, 0 profil sans settings** **[Vérifié DB]**. Storage : 8 objets `chat-media` cohérents.
Dette schéma : 3 index redondants sur `messages` ; pas de colonne d'idempotence client sur `messages` ; `conversation_participants(user_id)` non indexé.

## 16. État fonctionnel

**A — vérifié bout en bout** : aucune fonctionnalité ne peut être classée A (aucune session authentifiée n'a pu être déroulée ; seules des traces DB attestent d'exécutions passées).

**B — implémenté, non vérifié bout en bout** : auth email/OAuth/téléphone, profils, recherche utilisateurs, amis, DM texte, traduction texte, affichage original, réactions, read receipts, correction de traduction, mémoire relationnelle, confiance/ambiguïté, photos, aperçus de liens, blocage/sourdine, personnalisation, factures.

**C — partiel / fragile** : messagerie texte (5 messages bloqués en `pending`, risque de doublon), traduction (quota contournable/racy), transcription vocale (3 échecs 400 reproductibles), invitations QR/lien + guest web + conversion (0 exécution réelle), abonnement Stripe (0 abonnement réel).

**D — UI seulement / backend incomplet** : mot de passe oublié (pas d'écran de réinitialisation), notifications push, groupes multilingues (schéma prêt, `type='group'` jamais créé).

**E — absente** : live voice translation (flag `false`), export/suppression de données RGPD, rate limiting, tests automatisés, garbage collection des médias orphelins.

## 17. Priorisation

**Top 10 bloquants avant publication**
1. Transcription vocale iOS : extension `.webm` sur conteneur MP4 → 400 (Critique).
2. Doublons de messages : aucune idempotence serveur + 4 déclencheurs de retry (Critique).
3. 5 messages texte figés en `pending` : pas de reprise serveur (Haute).
4. Paywall personnalisation contournable par appel API direct (Haute).
5. SSRF via redirection dans `linkPreview` (Haute).
6. Quota : `consumeQuota` non atomique + vocaux non facturés (Haute).
7. Double appel STT possible par le reaper 60 s sans verrou (Haute).
8. Aucune limitation de débit (spam, coût IA, OTP) (Haute).
9. Mot de passe oublié sans écran de réinitialisation (Haute).
10. RGPD : ni suppression de compte ni export (Haute, contrainte légale).

**Top 10 importants non bloquants**
Race sur `max_uses` d'invitation · téléchargement complet avant troncature du preview · absence de timeout sur les appels IA · fan-out séquentiel (latence groupe) · `past_due` = premium illimité · index `conversation_participants(user_id)` · 3 index redondants sur `messages` · découpage de `chat.$conversationId.tsx` · télémétrie sur les `catch` silencieux · validation serveur type/taille des photos.

**5 éléments à NE PAS toucher pour l'instant**
1. `conversation_translation_memory` (portée correcte, aucune contamination).
2. Vérification de signature + idempotence du webhook Stripe.
3. `requireSupabaseAuth` / `attachSupabaseAuth` / gate `_authenticated`.
4. Le device-link QR (token 256 bits, TTL 2 min, usage unique).
5. Les policies RLS des buckets `chat-media` / `chat-backgrounds`.

**Ordre recommandé**
- **P0** : bugs 1, 2, 3 (vocal iOS, idempotence d'envoi, reprise des `pending`).
- **P1** : 4, 5, 6, 7 (paywall, SSRF, quota, verrou STT) + smoke tests 1→6.
- **P2** : rate limiting, mot de passe oublié, RGPD, index, timeouts IA.
- **P3** : refactor `chat.$conversationId.tsx`, tests automatisés, GC médias, groupes multilingues réels, notifications push.

## 18. Zones explicitement non vérifiées

Aucun parcours authentifié n'a pu être déroulé (`LOVABLE_BROWSER_AUTH_STATUS = signed_out`). Ne sont donc **pas** vérifiés à l'exécution : envoi réel et doublons, realtime, receipts, réactions, QR/guest, achat Stripe, notifications, reprise Safari. Les constats §5 (vocal) et les volumes §15 reposent sur des données réelles en base, pas sur une exécution pilotée.

---

**Prochaine étape proposée (aucune modification faite) :** si tu valides, je démarre par le P0 — d'abord la correction du nommage/extension audio iOS, puis l'idempotence d'envoi, puis la reprise serveur des traductions `pending`.
