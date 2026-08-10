import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/bottom-sheet";
import { QrCode } from "@/components/qr-code";
import { haptic } from "@/lib/chat-theme";
import { useT } from "@/lib/i18n";
import {
  createConversationInvite,
  listConversationInvites,
  revokeConversationInvite,
} from "@/lib/invites.functions";

function inviteUrl(code: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/join/${code}`;
}

/**
 * Invitation sheet: a QR code and a link that open a guest web chat.
 * The invited person needs no account and no installation.
 */
export function InviteSheet({
  open,
  onClose,
  conversationId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}) {
  const { t, locale } = useT();
  const queryClient = useQueryClient();

  const invites = useQuery({
    queryKey: ["invites", conversationId],
    enabled: open,
    queryFn: () => listConversationInvites({ data: { conversationId } }),
  });

  const active = (invites.data ?? []).find(
    (invite) =>
      !invite.revoked_at &&
      (!invite.expires_at || new Date(invite.expires_at).getTime() > Date.now()) &&
      (invite.max_uses === null || invite.uses < invite.max_uses),
  );

  const create = useMutation({
    mutationFn: () => createConversationInvite({ data: { conversationId } }),
    onSuccess: () => {
      haptic();
      void queryClient.invalidateQueries({ queryKey: ["invites", conversationId] });
    },
    onError: () => toast.error(t("invite.createError")),
  });

  const revoke = useMutation({
    mutationFn: (inviteId: string) => revokeConversationInvite({ data: { inviteId } }),
    onSuccess: () => {
      toast.success(t("invite.revokedSuccess"));
      void queryClient.invalidateQueries({ queryKey: ["invites", conversationId] });
    },
  });

  async function share(code: string) {
    const url = inviteUrl(code);
    haptic();
    if (navigator.share) {
      try {
        await navigator.share({ title: t("invite.shareTitle"), url });
        return;
      } catch {
        /* the user cancelled — fall back to copy */
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success(t("invite.linkCopied"));
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("invite.sheetTitle")}>
      <p className="mb-5 text-sm text-muted-foreground">{t("invite.sheetDescription")}</p>

      {invites.isLoading ? (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : active ? (
        <div className="flex flex-col items-center">
          <QrCode value={inviteUrl(active.code)} size={208} />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t("invite.usesCount", { used: active.uses, max: active.max_uses ?? "∞" })} ·{" "}
            {active.expires_at
              ? t("invite.expiresOn", {
                  date: new Date(active.expires_at).toLocaleDateString(locale),
                })
              : t("invite.noExpiration")}
          </p>

          <div className="mt-4 flex w-full gap-2">
            <button
              type="button"
              onClick={() => void share(active.code)}
              className="bg-brand flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-primary-foreground active:scale-95"
            >
              <Link2 className="h-4 w-4" /> {t("invite.shareLink")}
            </button>
            <button
              type="button"
              aria-label={t("invite.copyLink")}
              onClick={() => {
                void navigator.clipboard.writeText(inviteUrl(active.code));
                toast.success(t("invite.linkCopied"));
              }}
              className="glass flex h-12 w-12 items-center justify-center rounded-2xl"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => revoke.mutate(active.id)}
            className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <ShieldOff className="h-3.5 w-3.5" /> {t("invite.revokeInvite")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={create.isPending}
          onClick={() => create.mutate()}
          className="bg-brand flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("invite.createInvite")}
        </button>
      )}
    </BottomSheet>
  );
}
