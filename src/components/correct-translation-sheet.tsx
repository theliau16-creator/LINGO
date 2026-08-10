import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/bottom-sheet";
import { handleError } from "@/lib/backend-errors";
import { haptic } from "@/lib/chat-theme";
import { correctTranslation } from "@/lib/translation-memory.functions";
import { languageLabel } from "@/lib/languages";
import { useT } from "@/lib/i18n";

/**
 * "Corriger la traduction" sheet.
 * The original message is never modified: only the translation of this
 * message + language pair is replaced, and the choice is memorised for the
 * current relation only.
 */
export function CorrectTranslationSheet({
  open,
  onClose,
  messageId,
  language,
  originalText,
  sourceLanguage,
  currentTranslation,
  onCorrected,
}: {
  open: boolean;
  onClose: () => void;
  messageId: string | null;
  language: string;
  originalText: string;
  sourceLanguage: string;
  currentTranslation: string;
  onCorrected: (text: string) => void;
}) {
  const [value, setValue] = useState(currentTranslation);
  const run = useServerFn(correctTranslation);
  const { t } = useT();

  useEffect(() => {
    if (open) setValue(currentTranslation);
  }, [open, currentTranslation]);

  const save = useMutation({
    mutationFn: async () => {
      if (!messageId) return;
      return run({ data: { messageId, language, correctedText: value.trim() } });
    },
    onSuccess: () => {
      haptic();
      onCorrected(value.trim());
      toast.success(t("chat.correctionSaved"));
      onClose();
    },
    onError: (error) => toast.error(handleError("TRANSLATION_ERROR", error)),
  });

  return (
    <BottomSheet open={open} onClose={onClose} title={t("chat.correctTranslationTitle")}>
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("chat.original", { language: languageLabel(sourceLanguage) })}
          </p>
          <p className="glass mt-1 rounded-2xl px-4 py-2.5 text-[15px]">{originalText}</p>
        </div>

        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("chat.currentTranslation", { language: languageLabel(language) })}
          </p>
          <p className="glass mt-1 rounded-2xl px-4 py-2.5 text-[15px] text-muted-foreground">
            {currentTranslation}
          </p>
        </div>

        <div>
          <label
            htmlFor="corrected-translation"
            className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
          >
            {t("chat.correctTranslationLabel")}
          </label>
          <textarea
            id="corrected-translation"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={3}
            className="glass mt-1 w-full resize-none rounded-2xl px-4 py-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <p className="text-[12px] text-muted-foreground">{t("chat.correctTranslationHint")}</p>

        <button
          type="button"
          disabled={!value.trim() || save.isPending}
          onClick={() => save.mutate()}
          className="bg-brand shadow-glow w-full rounded-2xl py-3 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
        >
          {save.isPending ? t("chat.saving") : t("chat.saveCorrection")}
        </button>
      </div>
    </BottomSheet>
  );
}
