# Phase 12 — Plan de recette iPhone réel

Plan de recette complet, écran par écran et fonctionnalité par
fonctionnalité, pour l'app mobile Lingo (`feature/mobile-v1`), à exécuter
sur un iPhone physique. Chaque ligne a un résultat attendu et un critère
PASS/FAIL explicite. Voir [`PRE_RECETTE_CHECKLIST.md`](./PRE_RECETTE_CHECKLIST.md)
pour la configuration externe préalable requise par certaines sections.

**Légende des prérequis**
- 📱 = nécessite un iPhone physique (non testable en simulateur)
- 👥 = nécessite 2 comptes (même appareil ou 2 appareils)
- 📱📱 = nécessite 2 appareils physiques
- ⚙️ = nécessite une configuration externe précise (renvoi vers la checklist)

---

## 0. Pré-requis avant de commencer

| # | Vérification | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 0.1 | Build installé sur l'iPhone (`expo run:ios --device` ou TestFlight) | App installée, icône visible | ☐ |
| 0.2 | `mobile/.env` renseigné (URL/clé Supabase, `EXPO_PUBLIC_API_URL` pointant vers un serveur atteignable depuis l'iPhone — pas `localhost`) | App démarre sans erreur réseau immédiate | ☐ |
| 0.3 | Serveur TanStack Start (`src/routes/api/**`) démarré et atteignable depuis l'iPhone (même réseau ou déployé) | Requêtes `/api/*` aboutissent (vérifiable via un premier login) | ☐ |
| 0.4 | Deux comptes de test créés à l'avance (un jetable pour la suppression de compte) | — | ☐ |

---

## 1. Authentification — Email / mot de passe

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 1.1 | Créer un compte (email + mot de passe ≥ 8 caractères) | Compte créé ; si confirmation email activée côté Supabase, écran « Vérifiez votre email » ; sinon connecté directement | ☐ |
| 1.2 | Se connecter avec un compte existant | Redirection vers l'app (onboarding ou chats selon l'état du profil) | ☐ |
| 1.3 | Mot de passe incorrect | Message d'erreur clair, pas de crash | ☐ |
| 1.4 | Mot de passe oublié → email de réinitialisation → lien ouvert sur l'iPhone | Deep link `lingo://reset-password` ouvre l'écran de reset, nouveau mot de passe accepté, reconnexion possible avec le nouveau | ☐ 📱 |
| 1.5 | Fermer et rouvrir l'app après connexion | Session persistée (pas de redemande de connexion) | ☐ |
| 1.6 | Déconnexion (Profil → Se déconnecter) | Retour à l'écran de connexion, session locale purgée | ☐ |

## 2. Authentification — Sign in with Apple ⚙️ (§9)

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 2.1 | Bouton « Continue with Apple » sur Sign in **et** Sign up | Sheet natif Apple s'affiche | ☐ 📱 |
| 2.2 | Authentification complète (Face ID/Touch ID/code) | Session Supabase créée, redirection app | ☐ 📱 |
| 2.3 | Annulation en cours de flow (retour arrière dans le sheet) | Retour à l'écran de connexion, aucune erreur affichée, aucun état bloqué | ☐ 📱 |
| 2.4 | Vérifier dans Supabase Dashboard qu'un `auth.users` a été créé avec provider `apple` | Ligne présente | ☐ |

## 3. Authentification — Google OAuth ⚙️ (§10)

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 3.1 | Bouton « Continuer avec Google » | Navigateur in-app s'ouvre sur la page de consentement Google | ☐ 📱 |
| 3.2 | Connexion avec un compte Google | Retour automatique dans l'app, session créée | ☐ 📱 |
| 3.3 | Annulation (fermeture du navigateur in-app) | Retour à l'écran de connexion sans erreur | ☐ 📱 |
| 3.4 | Erreur volontaire (refuser l'accès côté Google) | Message d'erreur clair, pas de crash | ☐ 📱 |

## 4. Authentification — Téléphone ⚙️ (§11)

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 4.1 | « Continuer avec le téléphone » → sélection pays + numéro | SMS reçu sur le téléphone | ☐ 📱 |
| 4.2 | Saisie du code à 6 chiffres reçu | Connexion réussie | ☐ 📱 |
| 4.3 | Code invalide | Message d'erreur, champ réinitialisé | ☐ 📱 |
| 4.4 | Renvoyer le code (bouton, décompte 60s) | Nouveau SMS reçu, décompte respecté | ☐ 📱 |

## 5. Authentification — QR / Device-link

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 5.1 | Sur l'appareil A (connecté) : Profil → « Lier un appareil » → Générer un QR | QR affiché | ☐ |
| 5.2 | Sur l'appareil B (déconnecté) : Sign in → « Scanner un QR », scanner le QR de A | Autorisation caméra demandée puis scanner s'ouvre | ☐ 📱📱 |
| 5.3 | Scan réussi | Appareil B connecté au même compte que A, sans saisie de mot de passe | ☐ 📱📱 |
| 5.4 | Réutiliser le même QR une seconde fois | Message « QR déjà utilisé/expiré », pas de connexion | ☐ 📱📱 |
| 5.5 | Attendre > 2 min puis scanner | Message « QR expiré » | ☐ 📱📱 |
| 5.6 | Refuser la permission caméra au premier scan | Message explicatif + bouton « Autoriser »/« Ouvrir les réglages » selon l'état, pas de crash | ☐ 📱 |
| 5.7 | QR invalide (scanner un QR quelconque non-Lingo) | Message « QR invalide », scanner se ferme proprement | ☐ 📱 |

## 6. Onboarding

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 6.1 | Premher lancement après inscription (profil sans `country`) | Écran onboarding affiché, impossible d'accéder aux tabs sans le compléter | ☐ |
| 6.2 | Compléter pseudo + pays + langue | Redirection vers l'app, `profiles.country` renseigné | ☐ |
| 6.3 | Relancer l'app après onboarding complété | Onboarding non réaffiché | ☐ |

## 7. Discussions (liste)

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 7.1 | Ouvrir l'onglet Chats avec au moins une conversation existante | Liste affichée, dernier message + horodatage visibles | ☐ |
| 7.2 | Aucune conversation | État vide clair (pas un écran cassé) | ☐ |
| 7.3 | Nouveau message reçu pendant que l'app est ouverte sur cet écran | La liste se met à jour en direct (Realtime), sans pull-to-refresh | ☐ 👥 |
| 7.4 | Recherche/filtre (si présent) | Résultats cohérents | ☐ |

## 8. Conversation — messages texte + traduction

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 8.1 | Ouvrir une conversation | Historique chargé, ordre chronologique correct | ☐ |
| 8.2 | Envoyer un message texte | Apparaît immédiatement en état « envoi », puis confirmé | ☐ |
| 8.3 | **Compte B (langue différente de A) reçoit le message envoyé par A** | Le message s'affiche traduit dans la langue de B, texte original accessible/visible selon l'UI | ☐ 👥 **impératif avant release** |
| 8.4 | Couper le réseau pendant l'envoi puis le rétablir | Message marqué « échec », bouton retry fonctionnel | ☐ |
| 8.5 | Traduction en échec (ex. couper le réseau juste après l'envoi) | État « échec de traduction » visible, bouton de relance fonctionnel | ☐ |
| 8.6 | Faire défiler vers le haut (pagination) | Messages plus anciens se chargent | ☐ |
| 8.7 | Indicateur de présence (si affiché) | Reflète correctement si l'autre compte est en ligne | ☐ 👥 |

## 9. Conversation — médias

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 9.1 | Envoyer une photo depuis la pellicule | Permission photothèque demandée puis respectée ; aperçu avant envoi ; upload puis affichage dans la conversation | ☐ 📱 |
| 9.2 | **Compte B reçoit la photo** | Photo visible, chargement correct via URL signée | ☐ 👥📱 |
| 9.3 | Enregistrer un message vocal | Permission micro demandée ; enregistrement, arrêt, envoi | ☐ 📱 |
| 9.4 | Lecture d'un message vocal reçu | Lecture audio fonctionne, contrôle play/pause correct | ☐ 📱 |
| 9.5 | Transcription du message vocal (si prévue) | État transcription visible puis résultat, ou erreur claire si le provider échoue | ☐ 📱 |
| 9.6 | Refuser la permission photothèque/micro | Message explicatif, pas de crash, fonctionnalité concernée indisponible proprement | ☐ 📱 |

## 10. Amis

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 10.1 | Rechercher un utilisateur par pseudo | Résultats corrects | ☐ |
| 10.2 | Envoyer une demande d'ami (compte A → compte B) | Demande créée | ☐ 👥 |
| 10.3 | **Compte B voit la demande reçue** | Demande visible dans sa liste | ☐ 👥 |
| 10.4 | Compte B accepte | Les deux comptes se voient mutuellement comme amis ; conversation accessible | ☐ 👥 |
| 10.5 | Compte B refuse | Demande retirée des deux côtés, pas de conversation créée | ☐ 👥 |
| 10.6 | Bloquer un contact (A bloque B) | B n'apparaît plus accessible pour A ; **vérifier côté B** que l'envoi vers A échoue proprement | ☐ 👥 |
| 10.7 | Débloquer | Contact réapparaît, échanges de nouveau possibles | ☐ 👥 |

## 11. Profil / Réglages / Compte

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 11.1 | Modifier pseudo/langue | Sauvegarde confirmée, reflété immédiatement | ☐ |
| 11.2 | Toggle traduction automatique | Comportement de la conversation change en conséquence | ☐ |
| 11.3 | Toggle statut en ligne / accusés de lecture | Réglages persistés | ☐ |
| 11.4 | Voir/débloquer un compte bloqué depuis cet écran | Cohérent avec §10.7 | ☐ |
| 11.5 | Exporter mes données | Message clair (le téléchargement fichier n'est pas encore dispo sur mobile — vérifier que le message l'indique) | ☐ |
| 11.6 | **Supprimer le compte (utiliser le compte jetable, PAS un compte principal)** | Saisie « SUPPRIMER » requise, suppression effective, déconnexion automatique, compte inaccessible ensuite | ☐ ⚠️ compte jetable uniquement |

## 12. Premium / IAP ⚙️ (§7, §8)

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 12.1 | Compte non-Premium ouvre l'écran Premium | Fonctionnalités listées, offering RevenueCat chargé (produits + prix réels, pas de placeholder) | ☐ ⚙️ |
| 12.2 | Aucune offering configurée côté RevenueCat | Message « Aucun forfait disponible », pas de crash | ☐ |
| 12.3 | Sélectionner un forfait, lancer l'achat | Sheet StoreKit natif s'affiche avec le bon prix | ☐ 📱⚙️ |
| 12.4 | Annuler l'achat dans le sheet StoreKit | Retour à l'écran Premium sans message d'erreur (annulation silencieuse) | ☐ 📱⚙️ |
| 12.5 | Compléter un achat réel (compte Sandbox App Store) | Message de succès ou « validation en cours », statut Premium reflété après quelques secondes | ☐ 📱⚙️ |
| 12.6 | **Vérifier le webhook** : ligne créée/mise à jour dans `subscriptions` avec `provider='revenuecat'`, `status='active'` | Confirmé côté Supabase Dashboard | ☐ ⚙️ |
| 12.7 | Après achat, `GET /api/quota` renvoie `isPremium: true` | Quota illimité affiché partout dans l'app | ☐ |
| 12.8 | **Le même compte, vu depuis le web**, apparaît Premium | `useSubscription()` reflète le Premium acheté côté mobile | ☐ |
| 12.9 | Restaurer les achats sur un appareil sans achat local | Message « Aucun achat actif » si réellement aucun, pas de faux positif | ☐ 📱⚙️ |
| 12.10 | Restaurer les achats après réinstallation de l'app (achat existant) | Premium restauré correctement | ☐ 📱⚙️ |
| 12.11 | Compte déjà Premium via Stripe web ouvre l'écran Premium mobile | Affiché comme Premium (non-régression Stripe existant vu du mobile) | ☐ |
| 12.12 | Erreur réseau pendant l'achat | Message d'erreur clair, pas de double-débit, pas de crash | ☐ 📱 |

## 13. Notifications push ⚙️ (§5, §6)

| # | Étapes | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 13.1 | Première connexion : permission notifications demandée | Sheet iOS natif | ☐ 📱 |
| 13.2 | Refuser la permission | App continue de fonctionner normalement, aucune notification, pas de re-demande en boucle | ☐ 📱 |
| 13.3 | Accepter la permission | Token enregistré (vérifiable dans `device_tokens` côté Supabase) | ☐ 📱⚙️ |
| 13.4 | **Compte A envoie un message à compte B, app de B en arrière-plan** | B reçoit une notification système avec le bon aperçu | ☐ 👥📱⚙️ |
| 13.5 | **Compte A envoie un message à compte B, app de B fermée (killed)** | B reçoit la notification (réveil), aucune notification si l'app de B est **ouverte** sur cette conversation | ☐ 👥📱⚙️ |
| 13.6 | Tap sur la notification (app fermée) | App s'ouvre directement sur la conversation concernée | ☐ 👥📱⚙️ |
| 13.7 | Tap sur la notification (app en arrière-plan) | Passe au premier plan sur la conversation concernée | ☐ 👥📱⚙️ |
| 13.8 | **Compte A envoie un message : A lui-même ne reçoit jamais de notification pour son propre message** | Aucune notification côté A | ☐ 👥📱⚙️ |
| 13.9 | Déconnexion | Token supprimé de `device_tokens` (vérifiable côté Supabase) | ☐ ⚙️ |
| 13.10 | Message envoyé alors que l'app de B est ouverte, mais pas sur cette conversation | Pas de banner système (comportement volontaire : Realtime seul gère ce cas côté UI) | ☐ 👥📱 |

## 14. Non-régression transverse

| # | Vérification | Résultat attendu | PASS/FAIL |
|---|---|---|---|
| 14.1 | Rotation/mise en arrière-plan pendant un envoi de message | Pas de perte de message, reprise correcte au retour | ☐ 📱 |
| 14.2 | Perte de connexion réseau puis reconnexion | Realtime se reconnecte, pas de doublons de messages | ☐ 📱 |
| 14.3 | Deep link `lingo://reset-password` depuis Mail | Ouvre directement l'app sur le bon écran | ☐ 📱 |
| 14.4 | Aucun crash JS (RedBox) rencontré sur l'ensemble de la recette | — | ☐ |
| 14.5 | Aucune fuite de session après désinstallation/réinstallation | Reconnexion normale requise, pas d'état fantôme | ☐ 📱 |

---

## Synthèse GO / NO-GO

Remplir après exécution complète :

- Nombre de lignes PASS : ____ / ____
- Blocages critiques (section 8.3, 13.4–13.8, 12.5–12.8) : ☐ tous PASS ☐ au moins un FAIL
- Décision : ☐ GO ☐ NO-GO — commentaire : ______________________

*Document de recette — Phase 12. À exécuter avec deux appareils/comptes
et la configuration externe de [`PRE_RECETTE_CHECKLIST.md`](./PRE_RECETTE_CHECKLIST.md)
en place pour les sections marquées ⚙️.*
