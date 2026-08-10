import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/bottom-sheet";
import { haptic } from "@/lib/chat-theme";
import { languageFlag } from "@/lib/languages";
import { useT } from "@/lib/i18n";
import {
  eraseConversationMemory,
  getConversationMemory,
  toggleConversationMemory,
} from "@/lib/translation-memory.functions";

/**
 * Relation memory: the surnames, private jokes and corrections that Lingo
 * reuses in THIS conversation only.
 */
export function ConversationMemorySheet({
  open,
  onClose,
  conversationId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}) {
  const queryClient = useQueryClient();
  const { t } = useT();
  const key = ["conversation-memory", conversationId];

  const memory = useQuery({
    queryKey: key,
    enabled: open,
    queryFn: () => getConversationMemory({ data: { conversationId } }),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      toggleConversationMemory({ data: { conversationId, enabled } }),
    onSuccess: () => {
      haptic();
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.error(t("chat.memoryToggleFailed")),
  });

  const erase = useMutation({
    mutationFn: () => eraseConversationMemory({ data: { conversationId } }),
    onSuccess: () => {
      toast.success(t("chat.memoryErased"));
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const entries = memory.data?.entries ?? [];

  return (
    <BottomSheet open={open} onClose={onClose} title={t("chat.memoryTitle")}>
      <p className="mb-4 text-sm text-muted-foreground">{t("chat.memoryDescription")}</p>

      <label className="glass mb-4 flex items-center justify-between rounded-2xl px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <BrainCircuit className="h-4 w-4 text-primary" /> {t("chat.memoryActive")}
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-primary"
          checked={memory.data?.enabled ?? true}
          onChange={(event) => toggle.mutate(event.target.checked)}
        />
      </label>

      {memory.isLoading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("chat.memoryEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="glass rounded-2xl px-4 py-3 text-sm">
              <p className="font-medium">{entry.term}</p>
              <p className="text-muted-foreground">
                {languageFlag(entry.target_language)} {entry.preferred_translation}
              </p>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 ? (
        <button
          type="button"
          onClick={() => erase.mutate()}
          disabled={erase.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 px-4 py-3 text-sm font-semibold text-destructive"
        >
          <Trash2 className="h-4 w-4" /> {t("chat.memoryErase")}
        </button>
      ) : null}
    </BottomSheet>
  );
}
