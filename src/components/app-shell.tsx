import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Settings, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Avatar({
  name,
  url,
  size = 48,
  ring = false,
}: {
  name?: string | null | undefined;
  url?: string | null | undefined;
  size?: number | undefined;
  ring?: boolean | undefined;
}) {
  const { t } = useT();
  const initials = (name ?? "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand font-semibold text-primary-foreground",
        ring && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {url ? (
        <img src={url} alt={name ?? t("social.avatarAlt")} className="h-full w-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

const TABS = [
  { to: "/chats", key: "nav.chats", icon: MessageCircle },
  { to: "/friends", key: "nav.friends", icon: Users },
  { to: "/profile", key: "nav.profile", icon: User },
  { to: "/settings", key: "nav.settings", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useT();

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg px-3 pb-2">
      <div className="glass-strong flex items-center justify-around rounded-3xl px-2 py-2 shadow-soft">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.to);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium transition-all duration-300",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-2xl transition-all duration-300",
                  active ? "bg-brand shadow-glow" : "bg-transparent",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </span>
              {t(tab.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 pb-28">
      <header className="safe-top flex items-end justify-between gap-3 pt-4 pb-5">
        <div className="animate-rise">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      <main className="flex-1">{children}</main>
      <BottomNav />
    </div>
  );
}
