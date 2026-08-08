import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import listConversations from "./tools/list-conversations";
import readConversation from "./tools/read-conversation";
import sendMessage from "./tools/send-message";
import listFriends from "./tools/list-friends";
import searchUsers from "./tools/search-users";
import startConversation from "./tools/start-conversation";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "lingo",
  title: "Lingo",
  version: "0.1.0",
  instructions:
    "Tools for Lingo, a messaging app where every user writes in their own language and messages are translated automatically. Use list_conversations and read_conversation to catch up, send_message to reply (it is translated for the other participants), and search_users / list_friends / start_conversation to reach someone new.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: ([
    getMyProfile,
    listConversations,
    readConversation,
    sendMessage,
    listFriends,
    searchUsers,
    startConversation,
  ] as unknown as Parameters<typeof defineMcp>[0]["tools"]),
});
