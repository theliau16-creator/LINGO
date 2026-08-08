import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "send_message",
  title: "Send a message",
  description:
    "Send a message as the signed-in user in a Lingo conversation. It is automatically translated for the other participants.",
  inputSchema: {
    conversation_id: z.string().describe("Conversation id, from list_conversations."),
    text: z.string().describe("Message text, written in the sender's own language."),
    language: z
      .string()
      .optional()
      .describe("ISO-639-1 code of the message language. Defaults to the sender's primary language."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ conversation_id, text, language }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const body = text.trim();
    if (!body) return { content: [{ type: "text", text: "Message text is empty" }], isError: true };

    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;

    let sourceLanguage = language;
    if (!sourceLanguage) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("primary_language")
        .eq("id", userId)
        .maybeSingle();
      sourceLanguage = profile?.primary_language ?? "fr";
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        sender_id: userId,
        original_text: body,
        source_language: sourceLanguage,
      })
      .select("id, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    let translated = 0;
    try {
      const { translateMessageForParticipants } = await import("@/lib/chat.server");
      const outcome = await translateMessageForParticipants(supabase, data.id, userId);
      translated = outcome.translated;
    } catch (translationError) {
      console.error("[mcp] translation failed", translationError);
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ ...data, translated }) }],
      structuredContent: { message: data, translated },
    };
  },
});
