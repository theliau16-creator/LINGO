/**
 * NotificationService — abstraction over the delivery channel.
 *
 * Today: Web/PWA notifications. Tomorrow: Expo Push / APNs / FCM, by adding a
 * provider here. Nothing else in the app talks to the Notification API.
 */

export type LingoNotification = {
  title: string;
  body: string;
  /** In-app path to open when the user taps the notification. */
  url?: string;
  tag?: string;
};

export interface NotificationProvider {
  readonly id: string;
  isSupported(): boolean;
  permission(): NotificationPermission | "unsupported";
  request(): Promise<boolean>;
  notify(notification: LingoNotification): Promise<void>;
}

const webProvider: NotificationProvider = {
  id: "web",
  isSupported() {
    return typeof window !== "undefined" && "Notification" in window;
  },
  permission() {
    if (!this.isSupported()) return "unsupported";
    return Notification.permission;
  },
  async request() {
    if (!this.isSupported()) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
  },
  async notify(notification: LingoNotification) {
    if (!this.isSupported() || Notification.permission !== "granted") return;
    const instance = new Notification(notification.title, {
      body: notification.body,
      ...(notification.tag ? { tag: notification.tag } : {}),
      icon: "/favicon.ico",
    });
    if (notification.url) {
      instance.onclick = () => {
        window.focus();
        window.location.assign(notification.url!);
      };
    }
  },
};

export const NotificationService: NotificationProvider = webProvider;
