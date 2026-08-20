import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useAuth } from "./auth-context";
import { registerForPushNotifications } from "./push-notifications";

function openConversationFromResponse(response: Notifications.NotificationResponse) {
  const conversationId = response.notification.request.content.data?.["conversationId"];
  if (typeof conversationId === "string" && conversationId.length > 0) {
    router.push(`/chat/${conversationId}`);
  }
}

/**
 * Mounted once in the protected layout (same placement as the web's
 * useNotificationBridge): registers this device's push token for the
 * signed-in user, and routes a notification tap to its conversation —
 * whether tapped live (addNotificationResponseReceivedListener) or used to
 * cold-launch the app (getLastNotificationResponseAsync).
 */
export function usePushNotifications() {
  const { session } = useAuth();
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || registeredFor.current === userId) return;
    registeredFor.current = userId;
    void registerForPushNotifications(userId);
  }, [session?.user.id]);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openConversationFromResponse(response);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(openConversationFromResponse);
    return () => subscription.remove();
  }, []);
}
