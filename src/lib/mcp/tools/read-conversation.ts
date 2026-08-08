import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "read_conversation",
  title: "Read a conversation",
  description:
    "Read recent messages of a Lingo conversation, including their original text and available translations.",
  inputSchema: {
    conversation_id: z.string().describe("Conversation id, from list_conversations."),
    limit: z.number().int().optional().describe("Max messages to return (default 30)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ conversation_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const take = Math.min(Math.max(limit ?? 30, 1), 100);

    const { data: messages, error } = await supabase
      .from("messages")
      .select("id, sender_id, original_text, source_language, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(take);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const ordered = (messages ?? []).slice().reverse();
    const messageIds = ordered.map((m) => m.id);
    const { data: translations } = messageIds.length
      ? await supabase
          .from("message_translations")
          .select("message_id, language, translated_text")
          .in("message_id", messageIds)
      : { data: [] as { message_id: string; language: string; translated_text: string }[] };

    const result = ordered.map((message) => ({
      ...message,
      is_mine: message.sender_id === ctx.getUserId(),
      translations: (translations ?? [])
        .filter((t) => t.message_id === message.id)
        .map((t) => ({ language: t.language, text: t.translated_text })),
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: { messages: result },
    };
  },
});
