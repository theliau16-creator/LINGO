import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_friends",
  title: "List friends",
  description: "List the signed-in user's Lingo friends with their username and languages.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: friendships, error } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", ctx.getUserId()!);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const ids = (friendships ?? []).map((row) => row.friend_id);
    if (ids.length === 0) {
      return { content: [{ type: "text", text: "[]" }], structuredContent: { friends: [] } };
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, primary_language, secondary_language, country")
      .in("id", ids);
    if (profileError) {
      return { content: [{ type: "text", text: profileError.message }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(profiles ?? []) }],
      structuredContent: { friends: profiles ?? [] },
    };
  },
});
