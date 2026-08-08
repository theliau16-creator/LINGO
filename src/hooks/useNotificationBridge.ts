import { useEffect, useRef } from "react";
import { useCurrentUser } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NotificationService } from "@/services/notifications";

type MessageRow = { conversation_id: string; sender_id: string };
type SubscriptionRow = { status: string | null };

/**
 * Bridges realtime DB events to NotificationService. Mounted once in
 * _authenticated/route.tsx so it survives navigation between tabs instead of
 * re-subscribing on every page (each page also keeps its own realtime
 * listeners for its own data — this hook only triggers the notification
 * side-effect, it never touches query caches).
 */
export function useNotificationBridge() {
  const { data: user } = useCurrentUser();
  const lastSubscriptionStatus = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const messages = supabase
      .channel(`notify:messages:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as MessageRow;
          if (row.sender_id === user.id) return;
          if (window.location.pathname === `/chat/${row.conversation_id}`) return;
          void NotificationService.notify({
            title: "Nouveau message",
            body: "Vous avez reçu un nouveau message sur Lingo.",
            url: `/chat/${row.conversation_id}`,
            tag: `message-${row.conversation_id}`,
          });
        },
      )
      .subscribe();

    const friendRequests = supabase
      .channel(`notify:friend-requests:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "friend_requests",
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          void NotificationService.notify({
            title: "Nouvelle demande d'ami",
            body: "Quelqu'un souhaite vous ajouter sur Lingo.",
            url: "/friends",
            tag: "friend-request",
          });
        },
      )
      .subscribe();

    const subscriptions = supabase
      .channel(`notify:subscription:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as SubscriptionRow | null;
          const status = row?.status ?? null;
          if (!status || status === lastSubscriptionStatus.current) return;
          lastSubscriptionStatus.current = status;

          if (status === "active" || status === "trialing") {
            void NotificationService.notify({
              title: "Lingo Premium activé",
              body: "Vos traductions sont désormais illimitées.",
              url: "/subscription",
              tag: "subscription-active",
            });
          } else if (status === "past_due") {
            void NotificationService.notify({
              title: "Paiement échoué",
              body: "Mettez à jour votre moyen de paiement pour garder Premium.",
              url: "/subscription",
              tag: "subscription-past-due",
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(messages);
      void supabase.removeChannel(friendRequests);
      void supabase.removeChannel(subscriptions);
    };
  }, [user?.id]);
}
