
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      blocked_users: {
        Row: {
          blocked_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          blocked_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          blocked_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_preferences: {
        Row: {
          background_type: string
          background_value: string | null
          conversation_id: string | null
          created_at: string
          id: string
          incoming_message_color: string | null
          outgoing_message_color: string | null
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          background_type?: string
          background_value?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          incoming_message_color?: string | null
          outgoing_message_color?: string | null
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          background_type?: string
          background_value?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          incoming_message_color?: string | null
          outgoing_message_color?: string | null
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_preferences_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_invites: {
        Row: {
          code: string
          conversation_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          inviter_id: string
          max_uses: number | null
          revoked_at: string | null
          uses: number
        }
        Insert: {
          code: string
          conversation_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inviter_id: string
          max_uses?: number | null
          revoked_at?: string | null
          uses?: number
        }
        Update: {
          code?: string
          conversation_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inviter_id?: string
          max_uses?: number | null
          revoked_at?: string | null
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_invites_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          archived_at: string | null
          conversation_id: string
          created_at: string
          last_read_at: string | null
          muted_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          conversation_id: string
          created_at?: string
          last_read_at?: string | null
          muted_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          conversation_id?: string
          created_at?: string
          last_read_at?: string | null
          muted_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_translation_memory: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          preferred_translation: string
          source_language: string | null
          target_language: string
          term: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          preferred_translation: string
          source_language?: string | null
          target_language: string
          term: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          preferred_translation?: string
          source_language?: string | null
          target_language?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_translation_memory_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          name: string | null
          translation_memory_enabled: boolean
          type: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          name?: string | null
          translation_memory_enabled?: boolean
          type?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          name?: string | null
          translation_memory_enabled?: boolean
          type?: string
        }
        Relationships: []
      }
      device_link_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      guest_users: {
        Row: {
          claimed_by: string | null
          conversation_id: string
          created_at: string
          display_name: string
          id: string
          invite_id: string | null
          language: string
          last_seen_at: string | null
          token_hash: string
          updated_at: string
        }
        Insert: {
          claimed_by?: string | null
          conversation_id: string
          created_at?: string
          display_name: string
          id?: string
          invite_id?: string | null
          language?: string
          last_seen_at?: string | null
          token_hash: string
          updated_at?: string
        }
        Update: {
          claimed_by?: string | null
          conversation_id?: string
          created_at?: string
          display_name?: string
          id?: string
          invite_id?: string | null
          language?: string
          last_seen_at?: string | null
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_users_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_users_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "conversation_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      link_previews: {
        Row: {
          description: string | null
          fetched_at: string
          image_url: string | null
          site_name: string | null
          title: string | null
          url: string
        }
        Insert: {
          description?: string | null
          fetched_at?: string
          image_url?: string | null
          site_name?: string | null
          title?: string | null
          url: string
        }
        Update: {
          description?: string | null
          fetched_at?: string
          image_url?: string | null
          site_name?: string | null
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_receipts: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_translations: {
        Row: {
          alternative_translation: string | null
          confidence_score: number | null
          context_version: number
          corrected_by_user: boolean
          created_at: string
          engine: string
          id: string
          language: string
          message_id: string
          translated_text: string
          translation_provider: string | null
          updated_at: string
        }
        Insert: {
          alternative_translation?: string | null
          confidence_score?: number | null
          context_version?: number
          corrected_by_user?: boolean
          created_at?: string
          engine?: string
          id?: string
          language: string
          message_id: string
          translated_text: string
          translation_provider?: string | null
          updated_at?: string
        }
        Update: {
          alternative_translation?: string | null
          confidence_score?: number | null
          context_version?: number
          corrected_by_user?: boolean
          created_at?: string
          engine?: string
          id?: string
          language?: string
          message_id?: string
          translated_text?: string
          translation_provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_translations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          client_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_for: string[]
          guest_id: string | null
          id: string
          message_type: string
          original_text: string
          push_notified_at: string | null
          reply_to_message_id: string | null
          sender_id: string | null
          source_language: string
          status: string
          translation_error: string | null
          translation_status: string
          translation_version: number
          updated_at: string
        }
        Insert: {
          attachments?: Json
          client_id?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_for?: string[]
          guest_id?: string | null
          id?: string
          message_type?: string
          original_text: string
          push_notified_at?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          source_language?: string
          status?: string
          translation_error?: string | null
          translation_status?: string
          translation_version?: number
          updated_at?: string
        }
        Update: {
          attachments?: Json
          client_id?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_for?: string[]
          guest_id?: string | null
          id?: string
          message_type?: string
          original_text?: string
          push_notified_at?: string | null
          reply_to_message_id?: string | null
          sender_id?: string | null
          source_language?: string
          status?: string
          translation_error?: string | null
          translation_status?: string
          translation_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_stripe_events: {
        Row: {
          environment: string
          event_id: string
          processed_at: string
          type: string | null
        }
        Insert: {
          environment?: string
          event_id: string
          processed_at?: string
          type?: string | null
        }
        Update: {
          environment?: string
          event_id?: string
          processed_at?: string
          type?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          id: string
          phone: string | null
          primary_language: string
          secondary_language: string | null
          status: string | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          id: string
          phone?: string | null
          primary_language?: string
          secondary_language?: string | null
          status?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          id?: string
          phone?: string | null
          primary_language?: string
          secondary_language?: string | null
          status?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          updated_at?: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      translation_corrections: {
        Row: {
          conversation_id: string
          corrected_translation: string
          created_at: string
          id: string
          message_id: string
          original_text: string
          previous_translation: string | null
          source_language: string
          target_language: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          corrected_translation: string
          created_at?: string
          id?: string
          message_id: string
          original_text: string
          previous_translation?: string | null
          source_language: string
          target_language: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          corrected_translation?: string
          created_at?: string
          id?: string
          message_id?: string
          original_text?: string
          previous_translation?: string | null
          source_language?: string
          target_language?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_corrections_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translation_corrections_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_jobs: {
        Row: {
          attempts: number
          claimed_at: string
          language: string
          message_id: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string
          language: string
          message_id: string
        }
        Update: {
          attempts?: number
          claimed_at?: string
          language?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_logs: {
        Row: {
          created_at: string
          detected_language: string | null
          duration_ms: number | null
          engine: string
          error: string | null
          estimated_cost: number | null
          id: string
          original_text: string
          source_language: string
          status: string
          target_language: string
          translated_text: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detected_language?: string | null
          duration_ms?: number | null
          engine?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          original_text: string
          source_language: string
          status?: string
          target_language: string
          translated_text?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detected_language?: string | null
          duration_ms?: number | null
          engine?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          original_text?: string
          source_language?: string
          status?: string
          target_language?: string
          translated_text?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      translation_usage: {
        Row: {
          created_at: string
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          reason: string
          reported_user_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          reason: string
          reported_user_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          reason?: string
          reported_user_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          auto_translate: boolean
          created_at: string
          read_receipts_enabled: boolean
          show_online_status: boolean
          theme: string
          translation_engine: string
          user_id: string
        }
        Insert: {
          auto_translate?: boolean
          created_at?: string
          read_receipts_enabled?: boolean
          show_online_status?: boolean
          theme?: string
          translation_engine?: string
          user_id: string
        }
        Update: {
          auto_translate?: boolean
          created_at?: string
          read_receipts_enabled?: boolean
          show_online_status?: boolean
          theme?: string
          translation_engine?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_messages: {
        Row: {
          attempt_count: number
          audio_path: string
          conversation_id: string
          created_at: string
          duration_ms: number | null
          id: string
          message_id: string
          processing_started_at: string | null
          transcript: string | null
          transcript_language: string | null
          transcription_error: string | null
          transcription_status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          audio_path: string
          conversation_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          message_id: string
          processing_started_at?: string | null
          transcript?: string | null
          transcript_language?: string | null
          transcription_error?: string | null
          transcription_status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          audio_path?: string
          conversation_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          message_id?: string
          processing_started_at?: string | null
          transcript?: string | null
          transcript_language?: string | null
          transcription_error?: string | null
          transcription_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_friend_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      check_rate_limit: {
        Args: { _bucket: string; _limit: number; _window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after: number
        }[]
      }
      claim_invite_use: { Args: { _invite_id: string }; Returns: boolean }
      claim_translation_slot: {
        Args: {
          _language: string
          _message_id: string
          _stale_seconds?: number
        }
        Returns: boolean
      }
      claim_voice_job: {
        Args: { _message_id: string; _stale_seconds?: number }
        Returns: boolean
      }
      consume_translation_quota: {
        Args: { _amount?: number; _user_id: string }
        Returns: number
      }
      conversation_has_block: {
        Args: { _conversation_id: string; _sender_id: string }
        Returns: boolean
      }
      create_direct_conversation: {
        Args: { _friend_id: string }
        Returns: string
      }
      create_group_conversation: {
        Args: { _member_ids: string[]; _name: string }
        Returns: string
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_premium_user: { Args: { _user_id: string }; Returns: boolean }
      purge_rate_limits: { Args: never; Returns: undefined }
      release_translation_slot: {
        Args: { _language: string; _message_id: string }
        Returns: undefined
      }
      search_profiles: {
        Args: { _query: string }
        Returns: {
          avatar_url: string
          country: string
          id: string
          primary_language: string
          username: string
        }[]
      }
      shares_conversation: {
        Args: { _a: string; _b: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
