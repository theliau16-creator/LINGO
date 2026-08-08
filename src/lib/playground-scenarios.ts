/** Scripted conversations used by the Translation Playground. */

export type Scenario = {
  id: string;
  label: string;
  emoji: string;
  /** `me` = written by the current point of view, `them` = the test profile. */
  turns: { from: "me" | "them"; text: string }[];
};

export const SCENARIOS: Scenario[] = [
  {
    id: "voyage",
    label: "Voyage",
    emoji: "✈️",
    turns: [
      { from: "me", text: "Bonjour, à quelle heure part le prochain train pour le centre-ville ?" },
      { from: "them", text: "Il part dans vingt minutes, quai numéro trois." },
      { from: "me", text: "Parfait, où puis-je acheter un billet ?" },
      { from: "them", text: "Au distributeur juste derrière vous, il accepte la carte." },
    ],
  },
  {
    id: "restaurant",
    label: "Restaurant",
    emoji: "🍽️",
    turns: [
      { from: "me", text: "Bonsoir, avez-vous une table pour deux personnes ?" },
      { from: "them", text: "Oui, près de la fenêtre. Souhaitez-vous voir la carte ?" },
      { from: "me", text: "Volontiers. Je suis allergique aux fruits de mer." },
      { from: "them", text: "Je le note, je vous conseille le plat du jour végétarien." },
    ],
  },
  {
    id: "hotel",
    label: "Hôtel",
    emoji: "🏨",
    turns: [
      { from: "me", text: "Bonjour, j'ai une réservation au nom de Martin." },
      { from: "them", text: "Bienvenue, votre chambre est au quatrième étage." },
      { from: "me", text: "Le petit-déjeuner est-il inclus ?" },
      { from: "them", text: "Oui, de sept heures à dix heures au rez-de-chaussée." },
    ],
  },
  {
    id: "business",
    label: "Business",
    emoji: "💼",
    turns: [
      { from: "me", text: "Merci d'avoir pris le temps de me rencontrer aujourd'hui." },
      { from: "them", text: "Avec plaisir. Pouvez-vous nous présenter votre proposition ?" },
      { from: "me", text: "Bien sûr, nous pouvons livrer la première phase en six semaines." },
      { from: "them", text: "Intéressant. Quel serait le budget estimé ?" },
    ],
  },
  {
    id: "rencontre",
    label: "Rencontre",
    emoji: "💬",
    turns: [
      { from: "me", text: "Salut ! J'ai adoré ta photo du marché, c'était où ?" },
      { from: "them", text: "Merci ! C'était pendant mon voyage l'été dernier." },
      { from: "me", text: "Ça donne envie. Tu voyages souvent ?" },
      { from: "them", text: "Dès que je peux, j'adore découvrir de nouvelles cuisines." },
    ],
  },
  {
    id: "famille",
    label: "Famille",
    emoji: "👨‍👩‍👧",
    turns: [
      { from: "me", text: "Coucou, comment vont les enfants ?" },
      { from: "them", text: "Très bien, ils ont commencé les cours de natation." },
      { from: "me", text: "Génial ! On s'appelle ce week-end ?" },
      { from: "them", text: "Avec plaisir, dimanche après le déjeuner ?" },
    ],
  },
  {
    id: "urgence",
    label: "Urgence",
    emoji: "🚑",
    turns: [
      { from: "me", text: "J'ai besoin d'aide, où se trouve l'hôpital le plus proche ?" },
      { from: "them", text: "À deux rues d'ici, je peux vous y accompagner." },
      { from: "me", text: "Merci beaucoup, j'ai très mal au ventre." },
      { from: "them", text: "Restez calme, j'appelle les secours tout de suite." },
    ],
  },
  {
    id: "shopping",
    label: "Shopping",
    emoji: "🛍️",
    turns: [
      { from: "me", text: "Bonjour, avez-vous ce modèle en taille medium ?" },
      { from: "them", text: "Je vérifie en réserve, une petite minute." },
      { from: "me", text: "Merci. Puis-je l'essayer avant d'acheter ?" },
      { from: "them", text: "Bien sûr, les cabines sont au fond à droite." },
    ],
  },
];

/** Fictional profiles used to test each language pair without a second device. */
export const TEST_PROFILES = [
  { id: "fr", name: "Test User France", language: "fr" },
  { id: "en", name: "Test User UK", language: "en" },
  { id: "es", name: "Test User España", language: "es" },
  { id: "it", name: "Test User Italia", language: "it" },
  { id: "de", name: "Test User Deutschland", language: "de" },
  { id: "ja", name: "Test User Japan", language: "ja" },
  { id: "ko", name: "Test User Korea", language: "ko" },
  { id: "zh", name: "Test User China", language: "zh" },
  { id: "th", name: "Test User Thailand", language: "th" },
  { id: "ar", name: "Test User العربية", language: "ar" },
] as const;
