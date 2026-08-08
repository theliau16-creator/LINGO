# Lingo — Sprint « Beta Ready »

Objectif : fiabiliser l'app existante pour 50-100 bêta-testeurs. Aucune fonctionnalité actuelle n'est supprimée. Le travail est découpé en lots livrés dans l'ordre, chacun vérifié avant le suivant.

## Problèmes détectés dans le code actuel

- **Envoi couplé à la traduction** : `chat.$conversationId.tsx` insère le message puis attend `translateMessage`. Une erreur de traduction remonte à l'utilisateur comme un échec d'envoi.
- **Realtime brutal** : chaque évènement `messages` ou `message_translations` déclenche `invalidateQueries` → refetch complet de la conversation. Idem sur la liste des discussions (refetch total de tous les messages de toutes les conversations).
- **Aucune pagination** : la conversation charge tout l'historique ; `chats.tsx` charge *tous* les messages de *toutes* les conversations pour calculer les aperçus.
- **Pas de statuts de message** : ni envoyé/reçu/lu, ni état de traduction.
- **Pas de file offline** : un message tapé hors connexion est perdu.
- **Providers de traduction** : le registre ignore le moteur demandé et retombe silencieusement sur Lovable AI, sans notion « non configuré ».
- **Pas de suppression de compte, ni mot de passe oublié, ni signalement.**
- **QR** : token aléatoire + usage unique déjà présents, mais messages d'erreur peu explicites et pas de limitation de tentatives.

## Lot 1 — P0 Messagerie (migration + code)

Migration `messages` / statuts :
- `messages` : `status` (`sent|delivered|read`), `translation_status` (`pending|done|failed`), `translation_error`, `reply_to_message_id`, `deleted_at`, `deleted_for` (uuid[]).
- Nouvelle table `message_receipts` (message_id, user_id, delivered_at, read_at) + RLS participant.
- `conversations` : `type` (`direct|group`, défaut `direct`), `name`, `avatar_url` ; `conversation_participants` : `role` (défaut `member`), `archived_at`, `last_read_at`. Préparation groupes uniquement, pas d'UI.
- Realtime activé sur `message_translations` et `message_receipts`.

Code :
- Envoi découplé : insert immédiat + message optimiste (`sending` → `sent`), appel traduction en tâche de fond, échec = `translation_failed` + bouton « Réessayer », le message reste.
- `ensureTranslation(messageId, language)` côté serveur, cache durable `message_id + language`, contexte limité (3 derniers messages max, tronqué).
- Realtime chirurgical : injection du nouveau message / de la traduction directement dans le cache React Query, plus aucun refetch global.
- Pagination messages (curseur `created_at + id`, 40 par page, scroll inversé sans saut) et conversations (20, « charger plus »).
- Aperçus de la liste : une seule requête sur le dernier message par conversation au lieu de tout l'historique.

## Lot 2 — P0 Robustesse, erreurs, RLS

- File d'envoi locale (localStorage) + reprise à la reconnexion, indicateur discret « hors connexion ».
- Extension de `src/lib/backend-errors.ts` en gestionnaire central typé : `AUTH_ERROR`, `NETWORK_ERROR`, `MESSAGE_ERROR`, `TRANSLATION_ERROR`, `PAYMENT_ERROR`, `QR_ERROR`, `DATABASE_ERROR` → message FR utilisateur + log technique console/serveur (jamais de token/OTP/clé).
- Passage de chaque écran en revue : loading / empty / error / success (aucun écran blanc).
- Audit RLS de toutes les tables + linter Supabase ; correction des politiques trop larges (notamment lecture publique des profils, restreinte aux champs et aux relations utiles via une vue si nécessaire).
- Durcissement QR : erreurs distinctes (expiré / déjà utilisé / invalide), TTL court conservé, limitation de génération.
- OTP téléphone : limitation des renvois côté client + compteur, messages clairs déjà en place complétés.

## Lot 3 — P0/P1 Traduction & providers

- `TranslationProvider` réel pour Lovable AI, DeepL, Google : chaque provider déclare `isConfigured` ; sans clé → statut « non configuré » dans les Réglages, jamais d'erreur bloquante.
- Routeur de moteur (`economy | quality | premium`) avec repli systématique sur Lovable AI.
- Playground renommé **Translation Lab**, réservé admin/développeur/Premium, comparaison multi-providers avec durée, moteur, erreur, coût estimé.

## Lot 4 — P1 Expérience messagerie & social

- Typing indicator via Realtime Broadcast (debounce + expiration), présence en ligne / « vu il y a X », accusés de lecture — chacun respectant un réglage de confidentialité dans `user_settings`.
- Répondre à un message (aperçu cité), supprimer pour moi / pour tout le monde (traductions préservées), archiver ou supprimer une conversation côté utilisateur uniquement.
- Blocage utilisateur (table `blocked_users` existante, à faire respecter par des politiques et des triggers d'envoi), signalement (`user_reports` : raison, commentaire, dates, non exposée publiquement).
- Mot de passe oublié : demande d'email + page de réinitialisation.
- Suppression de compte : avertissement, confirmation par saisie du nom d'utilisateur, annulation de l'abonnement Stripe, anonymisation puis suppression du compte Auth.

## Lot 5 — P1 Notifications, Stripe, qualité

- `NotificationService` abstrait + implémentation Web Push/PWA (permission, affichage du message déjà traduit si disponible), remplaçable plus tard par FCM/APNs.
- Audit Stripe : idempotence du webhook (table `processed_stripe_events`), Premium jamais accordé côté frontend, gestion `trialing/past_due/canceled/cancel_at_period_end`, bandeau test réservé aux développeurs.
- Tests Vitest : langue, cache de traduction, helpers, permissions, statut d'abonnement ; test d'intégration du scénario critique A écrit en français → B reçoit en espagnol → B affiche l'original.
- Accessibilité (aria-labels, focus visible, contraste) et passe TypeScript strict sans `any`.

## Monorepo / mobile

Pas de migration d'arborescence dans ce sprint (risque trop élevé pour le MVP). À la place : un document `docs/mobile-architecture.md` décrivant le découpage cible `packages/core|types|api|translation`, ce qui est déjà indépendant du DOM et réutilisable tel quel par une future app Expo, et l'ordre d'extraction sûr.

## Détails techniques

- Chaque lot = une migration Supabase additive et rétro-compatible (aucun `DROP` de colonne existante), suivie de la mise à jour du code qui en dépend.
- Les fonctions serveur restent dans `*.functions.ts` (fines) + `*.server.ts` (logique), jamais importables côté client.
- Après chaque lot : build, lint, linter Supabase, et vérification manuelle du scénario d'envoi/traduction.

## Livrable

Rapport final : modifications, fichiers, migrations, tables/colonnes, fonctions opérationnelles vs préparées, configurations externes manquantes, problèmes restants, score de préparation bêta et 10 tests manuels à réaliser.
