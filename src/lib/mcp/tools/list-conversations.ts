import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_conversations",
  title: "List conversations",
  description:
    "List the signed-in user's Lingo conversations, most recently active first, with the other participants.",
  inputSchema: { limit: z.number().int().optional().describe("Max conversations to return (default 20).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    const take = Math.min(Math.max(limit ?? 20, 1), 50);

    const { data: mine, error: mineError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId);
    if (mineError) return { content: [{ type: "text", text: mineError.message }], isError: true };

    const ids = (mine ?? []).map((row) => row.conversation_id);
    if (ids.length === 0) {
      return { content: [{ type: "text", text: "[]" }], structuredContent: { conversations: [] } };
    }

    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("id, last_message_at")
      .in("id", ids)
      .order("last_message_at", { ascending: false })
      .limit(take);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const visibleIds = (conversations ?? []).map((c) => c.id);
    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", visibleIds);

    const otherIds = [
      ...new Set((participants ?? []).map((p) => p.user_id).filter((id) => id !== userId)),
    ];
    const { data: profiles } = otherIds.length
      ? await supabase.from("profiles").select("id, username, primary_language").in("id", otherIds)
      : { data: [] as { id: string; username: string; primary_language: string }[] };

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const result = (conversations ?? []).map((conversation) => ({
      id: conversation.id,
      last_message_at: conversation.last_message_at,
      participants: (participants ?? [])
        .filter((p) => p.conversation_id === conversation.id && p.user_id !== userId)
        .map((p) => byId.get(p.user_id) ?? { id: p.user_id }),
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: { conversations: result },
    };
  },
});
