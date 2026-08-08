import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "start_conversation",
  title: "Start a conversation",
  description:
    "Open the one-to-one Lingo conversation with another user, creating it if it does not exist yet. Returns its id.",
  inputSchema: { user_id: z.string().describe("Id of the other user, from search_users or list_friends.") },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ user_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    try {
      const { openDirectConversation } = await import("@/lib/chat.server");
      const result = await openDirectConversation(supabase, ctx.getUserId()!, user_id);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : "Unknown error" }],
        isError: true,
      };
    }
  },
});
