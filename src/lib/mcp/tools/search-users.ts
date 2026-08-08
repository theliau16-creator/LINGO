import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_users",
  title: "Search Lingo users",
  description: "Search Lingo users by username to find someone to chat with.",
  inputSchema: { query: z.string().describe("Username fragment to search for.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const term = query.trim().replace(/^@/, "");
    if (!term) return { content: [{ type: "text", text: "Empty query" }], isError: true };

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, primary_language, country")
      .ilike("username", `%${term}%`)
      .neq("id", ctx.getUserId()!)
      .limit(20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { users: data ?? [] },
    };
  },
});
