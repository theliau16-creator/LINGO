import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/app-shell";
import { BottomSheet } from "@/components/bottom-sheet";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/backend-errors";
import { languageLabel } from "@/lib/languages";
import { useT } from "@/lib/i18n";

const MIN_MEMBERS = 2;
const MAX_MEMBERS = 19;

type Friend = {
  id: string;
  username: string;
  avatar_url: string | null;
  primary_language: string;
};

/**
 * Minimal multilingual group creation: a name, at least two contacts.
 * The group itself is created by a database function that re-checks the
 * friendship of every member, so the client list is only a convenience.
 */
export function NewGroupSheet({ userId }: { userId: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const friendsQuery = useQuery({
    queryKey: ["group-friends", userId],
    enabled: open,
    queryFn: async (): Promise<Friend[]> => {
      const { data: links } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", userId);
      const ids = (links ?? []).map((row) => row.friend_id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, primary_language")
        .in("id", ids)
        .order("username");
      return data ?? [];
    },
  });

  const toggle = (id: string) => {
    if (navigator.vibrate) navigator.vibrate(6);
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= MAX_MEMBERS
          ? current
          : [...current, id],
    );
  };

  const create = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("create_group_conversation", {
        _name: name.trim(),
        _member_ids: selected,
      });
      if (error) throw error;
      setOpen(false);
      setName("");
      setSelected([]);
      navigate({ to: "/chat/$conversationId", params: { conversationId: data as string } });
    } catch (error) {
      // The database function raises explicit French messages (friends only, size limits).
      const message = error instanceof Error ? error.message : "";
      toast.error(message || handleError("DATABASE_ERROR", error));

    } finally {
      setSaving(false);
    }
  };

  const languages = new Set(
    (friendsQuery.data ?? [])
      .filter((friend) => selected.includes(friend.id))
      .map((friend) => friend.primary_language),
  );
  const ready = name.trim().length > 0 && selected.length >= MIN_MEMBERS && !saving;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 active:scale-90"
        aria-label={t("social.newGroup.ariaCreate")}
      >
        <Users className="h-5 w-5" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("social.newGroup.title")}>
        <label className="block text-xs font-semibold text-muted-foreground" htmlFor="group-name">
          {t("social.newGroup.nameLabel")}
        </label>
        <input
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 60))}
          placeholder={t("social.newGroup.namePlaceholder")}
          className="glass mt-2 w-full rounded-2xl px-4 py-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />

        <p className="mt-5 text-xs font-semibold text-muted-foreground">
          {t("social.newGroup.participants", { count: selected.length, max: MAX_MEMBERS })}
        </p>

        {friendsQuery.isLoading ? (
          <ul className="mt-3 space-y-2">
            {[0, 1, 2].map((index) => (
              <li key={index} className="glass h-16 animate-pulse rounded-2xl" />
            ))}
          </ul>
        ) : (friendsQuery.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("social.newGroup.noFriends")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(friendsQuery.data ?? []).map((friend) => {
              const active = selected.includes(friend.id);
              return (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() => toggle(friend.id)}
                    aria-pressed={active}
                    className="glass flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-transform duration-300 active:scale-[0.98]"
                  >
                    <Avatar name={friend.username} url={friend.avatar_url} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{friend.username}</span>
                      <span className="block text-xs text-muted-foreground">
                        {languageLabel(friend.primary_language)}
                      </span>
                    </span>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full ${
                        active ? "bg-brand text-primary-foreground" : "bg-muted-foreground/15"
                      }`}
                    >
                      {active ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {languages.size > 1 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {t("social.newGroup.multiLanguageHint", { count: languages.size })}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!ready}
          onClick={() => void create()}
          className="bg-brand mt-6 w-full rounded-2xl py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? t("social.newGroup.creating") : t("social.newGroup.create")}
        </button>
        {selected.length < MIN_MEMBERS ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t("social.newGroup.minMembersHint", { count: MIN_MEMBERS })}
          </p>
        ) : null}
      </BottomSheet>
    </>
  );
}
