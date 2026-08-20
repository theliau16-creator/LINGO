-- Phase 11 (mobile) — support multi-provider pour l'accès Premium (Stripe web
-- existant + RevenueCat/StoreKit mobile), migration purement additive.
--
-- Aucune colonne existante supprimée, aucune contrainte Stripe touchée : le
-- webhook Stripe (src/routes/api/public/payments/webhook.ts) continue de
-- lire/écrire stripe_customer_id/stripe_subscription_id/price_id exactement
-- comme avant, y compris son upsert sur la contrainte UNIQUE existante
-- (stripe_subscription_id). is_premium_user() n'a besoin d'aucun changement :
-- sa logique ne dépend déjà que de status/current_period_end, pas des
-- colonnes Stripe — elle reconnaît donc les lignes RevenueCat sans modification.

ALTER TABLE public.subscriptions
  ALTER COLUMN stripe_customer_id DROP NOT NULL,
  ALTER COLUMN stripe_subscription_id DROP NOT NULL,
  ALTER COLUMN price_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text;

-- Rétrocompatibilité : les lignes Stripe déjà existantes obtiennent aussi les
-- colonnes génériques, pour un futur code de lecture uniforme. Les écritures
-- futures du webhook Stripe (non modifié) continuent de ne remplir que les
-- colonnes stripe_*, ce qui est sans conséquence : is_premium_user() ne lit
-- ni provider_customer_id ni provider_subscription_id.
UPDATE public.subscriptions
SET provider_customer_id = stripe_customer_id,
    provider_subscription_id = stripe_subscription_id
WHERE provider = 'stripe' AND provider_subscription_id IS NULL;

-- Cible de conflit pour l'upsert idempotent du webhook RevenueCat — distincte
-- de la contrainte UNIQUE Stripe existante sur stripe_subscription_id.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_id_key
  ON public.subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_provider_idx ON public.subscriptions (provider);

-- Idempotence des webhooks RevenueCat, même mécanisme que
-- processed_stripe_events pour le webhook Stripe.
CREATE TABLE public.processed_revenuecat_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  environment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.processed_revenuecat_events TO service_role;
ALTER TABLE public.processed_revenuecat_events ENABLE ROW LEVEL SECURITY;
-- Aucune policy authenticated/anon : table serveur uniquement (service_role
-- contourne RLS), même posture que processed_stripe_events.
