# MIGRATION_CHECKLIST.md

Fichier temporaire de suivi — sera supprimé à la toute fin de la migration.

**Contexte important** : ce dépôt n'est pas un squelette à recréer, c'est déjà
l'app Lingo complète exportée par Lovable. "Terminé" ici signifie : le fichier
source existe, a été lu/vérifié, compile (typecheck+build passent sur
l'ensemble de `src/`), ne contient aucun mock/TODO/stub, et — quand c'est
possible sans session réelle — a été testé dans le navigateur. Les éléments
qui nécessitent une vraie session (Supabase Auth réelle, Stripe réel) sont
marqués "code vérifié, test E2E en attente d'une session".

## Routes (19 fichiers dans src/routes/, confirmées via routeTree.gen.ts)

- [x] `/` — index.tsx — testé navigateur (pixel conforme, 0 erreur console)
- [x] `/auth` — auth.tsx (363 lignes: email/mdp, Google, Apple, téléphone, QR) — testé navigateur
- [x] `/onboarding` — onboarding.tsx (167 lignes) — code vérifié, test E2E en attente d'une session
- [x] `/chats` — chats.tsx (375 lignes, recherche, liste, realtime) — protection d'accès testée (redirige vers /auth si non connecté) ; contenu en attente de session
- [x] `/chat/:conversationId` — chat.$conversationId.tsx (672 lignes, le plus gros fichier de route — messages, traduction, presence) — code vérifié, test E2E en attente d'une session
- [x] `/friends` — friends.tsx (254 lignes, recherche, demandes, liste) — code vérifié, test E2E en attente d'une session
- [x] `/profile` — profile.tsx (424 lignes, QR, device-link, suppression compte) — code vérifié, test E2E en attente d'une session
- [x] `/settings` — settings.tsx (431 lignes, moteur de traduction, langue, dev mode) — code vérifié, test E2E en attente d'une session
- [x] `/premium` — premium.tsx (173 lignes, Stripe Embedded Checkout) — protection d'accès testée ; contenu en attente de session
- [x] `/subscription` — subscription.tsx (324 lignes, portail client Stripe, statut) — code vérifié, test E2E en attente d'une session
- [x] `/admin` — admin.tsx (203 lignes, recherche utilisateur, reset quota) — code vérifié, test E2E en attente d'une session (+ nécessite rôle admin)
- [x] `/playground` — playground.tsx (366 lignes) — conservé tel quel (décision utilisateur), NON à recréer si absent

### Routes supplémentaires détectées (hors liste initiale, propres à l'intégration Lovable/MCP)
- [x] `/.lovable/oauth/consent` — `[.]lovable.oauth.consent.tsx`
- [x] `/.mcp/invoke-tool/$tool`, `/.mcp/list-tools` — serveur MCP interne
- [x] `/.well-known/oauth-protected-resource`
- [x] `/mcp` — mcp.ts
- [x] `/api/public/payments/webhook` — webhook Stripe

## Composants

- [x] App Shell (`app-shell.tsx`, 109 lignes — nav du bas incluse)
- [x] Bottom navigation (dans app-shell.tsx)
- [x] Global Search (`global-search.tsx`, 257 lignes)
- [x] QR Code (`qr-code.tsx`)
- [x] QR Scanner (`qr-scanner.tsx`, html5-qrcode)
- [x] Phone Auth (`phone-auth.tsx`, 217 lignes)
- [x] Chat customization (`chat-customizer.tsx`, 374 lignes)
- [x] Contact actions (`contact-actions.tsx`, 396 lignes)
- [x] Premium upsell (`premium-upsell.tsx`)
- [x] Quota card (`quota-card.tsx`)
- [x] Stripe Embedded Checkout (`stripe-embedded-checkout.tsx`)
- [x] Payment test mode banner (`payment-test-mode-banner.tsx`)
- [x] Bottom sheet (`bottom-sheet.tsx`)
- [x] 46 composants `src/components/ui/**` (shadcn) — tous présents

## Fonctionnalités / backend

- [x] Friends (friends.tsx + friendships table)
- [x] Friend requests (friend_requests table + accept/decline)
- [x] User search (global-search.tsx + admin.tsx)
- [x] Realtime messages (canaux Supabase confirmés dans chat.$conversationId.tsx, chats.tsx)
- [x] Presence (`usePresence.ts`, 67 lignes, canal Supabase)
- [x] Traduction réelle — 3 providers (deepl.server.ts, google.server.ts, lovable-ai.server.ts) + registry.server.ts avec routage/fallback — AUCUN mock
- [x] Quota de traduction — `FREE_TRANSLATION_LIMIT = 1000` (corrigé cette session), illimité en Premium
- [x] Premium (premium.tsx + Stripe Embedded Checkout réel)
- [x] Stripe Embedded Checkout (EmbeddedCheckout/EmbeddedCheckoutProvider confirmés, pas de faux bouton)
- [x] Subscription management (subscription.tsx + createPortalSession réel)
- [x] Billing (billing.server.ts 167 lignes + billing.functions.ts 93 lignes)
- [x] Notifications (`src/services/notifications/index.ts`)
- [x] i18n (i18n.ts, 7 langues, langue = profil utilisateur)
- [x] Supabase Auth (useAuth.ts, auth-attacher.ts, auth-middleware.ts)
- [x] Supabase database — 16 tables confirmées dans les 13 migrations
- [x] Supabase RLS — policies présentes sur 7 fichiers de migration
- [x] User settings (`useUserSettings.ts` + user_settings table)
- [x] Chat preferences (`useChatPreferences.ts`, 112 lignes + chat_preferences table)
- [x] Admin (admin.tsx + admin.server.ts)
- [x] Error handling (`backend-errors.ts`, `error-capture.ts`, `error-page.ts`)
- [x] Responsive — vérifié 375×812 / 768×1024 / 1440×900 sur `/` et `/auth`, en attente sur pages authentifiées
- [ ] Dark mode — non identifié comme feature togglable distincte ; l'app est dark-only (pas de light mode dans le design source) — à confirmer avec l'utilisateur si un mode clair existait

## Non-régression déjà vérifiée cette session

- [x] `bunx tsc --noEmit` — 0 erreur sur l'ensemble du dépôt
- [x] `bun run build` — build client + serveur (SSR + cloudflare-module) réussi
- [x] Aucun TODO/FIXME/mock/stub détecté dans `src/` (grep exhaustif)
- [x] Aucun fichier de route vide ou stub (12 à 672 lignes selon la complexité de l'écran)

## Reste à faire (bloqué sur une session réelle, pas sur du code manquant)

- [ ] Test E2E de chaque route authentifiée avec un vrai compte (voir demande de connexion précédente)
- [ ] Test réel d'un paiement Stripe sandbox (nécessite `STRIPE_SANDBOX_API_KEY`/`LOVABLE_API_KEY` configurées côté serveur)
- [ ] Test réel d'une traduction (nécessite une conversation + 2 comptes)

## Indépendance vis-à-vis de Lovable (décidé avec l'utilisateur, portée réduite : pas de réécriture complète)

Décision : garder le code existant (déjà vérifié), retirer uniquement les
dépendances Lovable encore actives. Rejeté : reconstruction complète du
schéma DB / nouvelle intégration Stripe (l'utilisateur a choisi de garder
la gateway Lovable pour Stripe). Pas d'installation Docker/Supabase local
(l'utilisateur a choisi de garder le projet Supabase distant existant, qui
ne dépend déjà pas de Lovable).

- [x] OAuth Google/Apple — basculé de `lovable.auth.signInWithOAuth` (broker Lovable, 404 en local) vers `supabase.auth.signInWithOAuth` natif (`src/routes/auth.tsx`). Vérifié en navigateur : redirige vers `*.supabase.co/auth/v1/authorize` (plus de 404). Reste bloqué sur "provider non configuré côté dashboard Supabase" — hors dépôt.
- [x] Branding "Lingo AI" — déjà correct dans le code source (`src/services/translation/types.ts` `AVAILABLE_ENGINES`), aucun nom de vendor (Google/DeepL/OpenAI) affiché à l'utilisateur pour le moteur par défaut. Aucun changement nécessaire.
- [~] Stripe — toujours via la gateway Lovable (`connector-gateway.lovable.dev`), décision explicite de l'utilisateur de ne pas basculer vers Stripe direct maintenant (nécessiterait de vraies clés test Stripe qu'il n'a pas encore fournies).
- [~] `.lovable/`, MCP interne (`src/lib/mcp/`, routes `[.mcp]`, `[.well-known]`) — non supprimés : ce sont des surfaces techniques inertes (rien ne les appelle sauf un client MCP externe), pas une dépendance bloquante pour lancer/développer l'app. À trancher séparément si l'utilisateur veut les retirer.
- [ ] Supabase local (Docker) — non fait, décision explicite de l'utilisateur de garder le projet distant existant.

## Nouvelles fonctionnalités demandées (absentes du dépôt source Lovable — hors périmètre d'un portage 1:1, ajoutées sur demande explicite)

- [x] Notifications réellement câblées — `src/hooks/useNotificationBridge.ts`, monté une fois dans `_authenticated/route.tsx`. Déclenche `NotificationService.notify()` sur : nouveau message reçu (canal Realtime `messages`, hors conversation ouverte), nouvelle demande d'ami reçue (canal Realtime `friend_requests`), changement de statut d'abonnement (canal Realtime `subscriptions` — Premium activé / paiement échoué). Auparavant le service existait mais n'était appelé que par le bouton de test dans Réglages. Compile, build OK. **Non testé en conditions réelles** (nécessite une session + permission navigateur accordée).
- [x] Mute/Bloquer — déjà entièrement implémenté dans le code source (`contact-actions.tsx` : bloquer/débloquer via `blocked_users`, sourdine/réactiver via `conversation_participants.muted_at`). Aucune table `muted_users` séparée créée : la colonne existante fait déjà le travail et créer une table parallèle aurait dupliqué le schéma. Aucun changement nécessaire.
- [~] Architecture message vocal — `src/services/speech/types.ts` (contrats `TranscriptionProvider`, `SpeechRecorder`) + `src/services/speech/local.server.ts` (stub `isConfigured: false`, même patron que les providers de traduction). **Architecture seule : aucune UI d'enregistrement, rien de fonctionnel.** Nécessiterait un vrai provider de transcription (clé API externe) et un composant d'enregistrement audio pour devenir une fonctionnalité réelle.
- [~] Architecture appels audio/vidéo — `src/services/calls/types.ts` (contrats `CallSession`, `CallSignal`, `CallSignalingChannel`, `CallSubtitle` réutilisant transcription+traduction). **Architecture seule : pas de WebRTC, pas de signaling réel, pas d'UI.** La messagerie texte reste la fonctionnalité principale, conformément à la consigne de ne pas la sacrifier pour les appels.
