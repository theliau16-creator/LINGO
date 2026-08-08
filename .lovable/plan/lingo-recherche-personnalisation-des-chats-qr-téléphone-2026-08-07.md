# Lingo — Recherche, personnalisation des chats, QR & téléphone

Tout l'existant est conservé (chats traduits, amis, réglages, profil). Les nouveautés reprennent le design system actuel (glassmorphism, bulles arrondies, animations).

## 1. Profil — remplacer « Statut » par la recherche
- Suppression du champ « Statut » de la page Profil (la colonne reste en base, non utilisée).
- À sa place : une barre de recherche arrondie avec icône loupe, placeholder « Rechercher… », focus animé (halo + agrandissement).
- Résultats en temps réel (debounce ~250 ms) regroupés par catégorie :
  - Utilisateurs / pseudos (recherche `@pseudo`, insensible à la casse)
  - Conversations existantes (via le pseudo de l'interlocuteur)
  - Langues (liste locale)
  - Fonctionnalités de l'app (raccourcis : Réglages, Amis, Mon QR code…)
- Chaque résultat utilisateur affiche avatar, nom, @pseudo, drapeau + langue principale, et une action (Ouvrir la conversation / Ajouter).
- Recherche par numéro de téléphone prise en charge une fois le champ téléphone présent sur le profil (ajouté au point 5).

## 2. Personnalisation par conversation
Nouveau bottom sheet « Personnaliser le chat » depuis l'en-tête de la conversation, avec aperçu en direct :
- **Fond d'écran** : uni, dégradé, images fournies par l'app (plusieurs presets élégants), photo depuis la galerie ou la caméra (upload dans un bucket Storage privé `chat-backgrounds`).
- **Couleurs des bulles** : palette Bleu, Violet, Rose, Rouge, Orange, Jaune, Vert, Turquoise, Noir, Blanc + sélecteur personnalisé. Couleurs séparées pour mes messages et ceux de l'interlocuteur. Le texte bascule automatiquement clair/foncé selon le contraste calculé.
- **Thèmes prédéfinis** : Ocean, Sunset, Midnight, Forest, Minimal, Neon — appliquent fond + bulles + accents, avec aperçu avant validation.
- Boutons « Réinitialiser » et « Appliquer à toutes mes conversations ».
- Préférences propres à chaque utilisateur et à chaque conversation, synchronisées entre appareils.

## 3. Connexion par numéro de téléphone
- Nouveau bouton « Continuer avec mon numéro » sur l'écran de connexion.
- Écran numéro : sélecteur de pays avec indicatif (🇫🇷 +33…) + champ numéro + « Continuer ».
- Écran OTP : 6 cases, auto-remplissage SMS quand le navigateur le permet, compte à rebours, « Renvoyer le code », « Modifier le numéro ».
- Utilise l'OTP téléphone natif du backend ; aucun code n'est stocké côté application.
- Prérequis : un fournisseur SMS (Twilio ou équivalent) doit être configuré côté backend, sinon l'envoi échouera. Je préviendrai à la fin des étapes exactes.

## 4. QR codes
- **Mon QR code** (profil) : carte premium avec avatar + pseudo autour du code, boutons « Partager » et « Enregistrer » (téléchargement PNG).
- Scanner depuis le profil et depuis l'écran de connexion (caméra, cadre animé).
- Le QR d'un profil ouvre l'aperçu du profil scanné avec « Ajouter » / « Démarrer une conversation ».
- **Connexion par QR** : l'appareil déjà connecté génère un jeton temporaire à usage unique (durée de vie courte) ; l'appareil qui scanne l'échange contre une session. Jeton invalidé après usage, message clair si expiré. Aucun mot de passe ni jeton permanent dans le QR.

## 5. Contacts
- Depuis un profil ou un QR : bouton « Ajouter » envoyant une demande.
- États affichés : Demande envoyée, Demande reçue (Accepter / Refuser), Amis, Bloqué.
- Une fois amis : « Démarrer une conversation ».
- Ajout du blocage (aujourd'hui absent) et du numéro de téléphone sur le profil pour la recherche.

## Détails techniques
- Nouvelles tables : `chat_preferences` (user_id, conversation_id, background_type, background_value, outgoing_message_color, incoming_message_color, theme, timestamps, unicité user+conversation, valeur `conversation_id NULL` pour le réglage global), `device_link_tokens` (hash du jeton, user_id, expiration, usage unique), `blocked_users`. Ajout de `phone` sur `profiles`.
- RLS : chaque utilisateur ne lit/écrit que ses propres préférences et jetons ; grants explicites pour `authenticated` / `service_role`.
- Bucket Storage privé `chat-backgrounds` avec policies par dossier utilisateur ; upload via URL signée.
- Génération/échange des jetons de connexion QR via server functions TanStack (`createServerFn`), jamais côté client.
- Recherche via requêtes `ilike` sur `profiles` (index trigram) + filtrage local pour langues et fonctionnalités.
- Nouvelles dépendances : `qrcode` (génération) et un lecteur QR basé caméra (`html5-qrcode` ou équivalent), `react-colorful` pour le sélecteur de couleur.
- Haptic feedback via l'API Vibration quand disponible ; bottom sheets réutilisables ajoutés au design system.

## Ordre de livraison
1. Migration base + Storage
2. Recherche du profil (remplacement du statut)
3. Personnalisation des conversations (fonds, couleurs, thèmes)
4. QR personnel + scanner + ajout de contact / états
5. Connexion téléphone (OTP) et connexion par QR
6. Vérification de bout en bout de la liste de contrôle
