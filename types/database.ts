export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          blood_group: string | null;
          allergies: string | null;
          medical_notes: string | null;
          preferred_language: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          blood_group?: string | null;
          allergies?: string | null;
          medical_notes?: string | null;
          preferred_language?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      guardian_relationships: {
        Row: {
          id: string;
          protected_user_id: string;
          guardian_user_id: string | null;
          guardian_name: string;
          guardian_email: string | null;
          guardian_phone: string | null;
          relationship: string | null;
          status: 'pending' | 'accepted' | 'declined' | 'removed';
          is_primary: boolean;
          invite_code: string | null;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          protected_user_id: string;
          guardian_user_id?: string | null;
          guardian_name: string;
          guardian_email?: string | null;
          guardian_phone?: string | null;
          relationship?: string | null;
          status?: 'pending' | 'accepted' | 'declined' | 'removed';
          is_primary?: boolean;
          invite_code?: string | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['guardian_relationships']['Insert']>;
        Relationships: [];
      };
      incidents: {
        Row: {
          id: string;
          user_id: string;
          status: 'active' | 'resolved' | 'cancelled' | 'false_alarm';
          activation_source: string;
          is_demo: boolean;
          started_at: string;
          ended_at: string | null;
          incident_latitude: number | null;
          incident_longitude: number | null;
          last_latitude: number | null;
          last_longitude: number | null;
          location_accuracy: number | null;
          battery_level: number | null;
          cancelled_during_countdown: boolean;
          native_activation_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: 'active' | 'resolved' | 'cancelled' | 'false_alarm';
          activation_source: string;
          is_demo?: boolean;
          started_at?: string;
          ended_at?: string | null;
          incident_latitude?: number | null;
          incident_longitude?: number | null;
          last_latitude?: number | null;
          last_longitude?: number | null;
          location_accuracy?: number | null;
          battery_level?: number | null;
          cancelled_during_countdown?: boolean;
          native_activation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['incidents']['Insert']>;
        Relationships: [];
      };
      incident_locations: {
        Row: {
          id: number;
          incident_id: string;
          latitude: number;
          longitude: number;
          accuracy: number | null;
          recorded_at: string;
        };
        Insert: {
          id?: number;
          incident_id: string;
          latitude: number;
          longitude: number;
          accuracy?: number | null;
          recorded_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      incident_guardians: {
        Row: {
          id: string;
          incident_id: string;
          guardian_user_id: string;
          delivery_status: 'pending' | 'delivered' | 'failed';
          acknowledgement_status: 'not_acknowledged' | 'seen' | 'responding' | 'cannot_respond';
          acknowledged_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          incident_id: string;
          guardian_user_id: string;
          delivery_status?: 'pending' | 'delivered' | 'failed';
          acknowledgement_status?: 'not_acknowledged' | 'seen' | 'responding' | 'cannot_respond';
          acknowledged_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['incident_guardians']['Insert']>;
        Relationships: [];
      };
      device_push_tokens: {
        Row: {
          id: string;
          user_id: string;
          expo_push_token: string;
          platform: string;
          device_name: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          expo_push_token: string;
          platform: string;
          device_name?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['device_push_tokens']['Insert']>;
        Relationships: [];
      };
      incident_recipients: {
        Row: {
          id: string;
          incident_id: string;
          relationship_id: string | null;
          guardian_user_id: string | null;
          guardian_name: string;
          guardian_phone: string | null;
          is_primary: boolean;
          push_status: 'not_applicable' | 'pending' | 'delivered' | 'failed';
          sms_status: 'not_configured' | 'pending' | 'sent' | 'failed' | 'skipped';
          escalation_status: 'waiting' | 'not_needed' | 'sent' | 'failed';
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          incident_id: string;
          relationship_id?: string | null;
          guardian_user_id?: string | null;
          guardian_name: string;
          guardian_phone?: string | null;
          is_primary?: boolean;
          push_status?: 'not_applicable' | 'pending' | 'delivered' | 'failed';
          sms_status?: 'not_configured' | 'pending' | 'sent' | 'failed' | 'skipped';
          escalation_status?: 'waiting' | 'not_needed' | 'sent' | 'failed';
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['incident_recipients']['Insert']>;
        Relationships: [];
      };
      incident_escalation_events: {
        Row: {
          id: number;
          incident_id: string;
          level: number;
          kind: 'initial_delivery' | 'guardian_timeout' | 'emergency_call_handoff' | 'responder_simulation';
          status: 'pending' | 'completed' | 'partial' | 'failed' | 'simulated';
          message: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          incident_id: string;
          level?: number;
          kind: 'initial_delivery' | 'guardian_timeout' | 'emergency_call_handoff' | 'responder_simulation';
          status: 'pending' | 'completed' | 'partial' | 'failed' | 'simulated';
          message: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      protection_devices: {
        Row: {
          id: string;
          user_id: string;
          installation_id: string;
          secret_hash: string;
          platform: 'android';
          enabled: boolean;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          installation_id: string;
          secret_hash: string;
          platform?: 'android';
          enabled?: boolean;
          last_used_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['protection_devices']['Insert']>;
        Relationships: [];
      };
      notification_deliveries: {
        Row: {
          id: string;
          incident_id: string;
          recipient_id: string | null;
          guardian_user_id: string | null;
          push_token_id: string | null;
          provider: 'expo' | 'twilio';
          provider_ticket_id: string | null;
          status: 'pending' | 'accepted' | 'failed' | 'actioned';
          provider_error: string | null;
          action: 'seen' | 'responding' | 'cannot_respond' | 'open_location' | null;
          actioned_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          incident_id: string;
          recipient_id?: string | null;
          guardian_user_id?: string | null;
          push_token_id?: string | null;
          provider?: 'expo' | 'twilio';
          provider_ticket_id?: string | null;
          status?: 'pending' | 'accepted' | 'failed' | 'actioned';
          provider_error?: string | null;
          action?: 'seen' | 'responding' | 'cannot_respond' | 'open_location' | null;
          actioned_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notification_deliveries']['Insert']>;
        Relationships: [];
      };
      incident_evidence: {
        Row: {
          id: string;
          incident_id: string;
          user_id: string;
          storage_path: string;
          media_type: 'video' | 'audio';
          mime_type: 'video/mp4' | 'audio/mp4';
          status: 'pending' | 'uploaded' | 'failed';
          byte_size: number;
          duration_ms: number;
          sha256: string | null;
          captured_at: string;
          uploaded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          incident_id: string;
          user_id: string;
          storage_path: string;
          media_type: 'video' | 'audio';
          mime_type: 'video/mp4' | 'audio/mp4';
          status?: 'pending' | 'uploaded' | 'failed';
          byte_size?: number;
          duration_ms?: number;
          sha256?: string | null;
          captured_at: string;
          uploaded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['incident_evidence']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      respond_to_guardian_invitation: {
        Args: { invitation_code: string; decision: 'accepted' | 'declined' };
        Returns: Database['public']['Tables']['guardian_relationships']['Row'][];
      };
      set_primary_guardian: { Args: { relationship_id: string }; Returns: undefined };
      assign_incident_guardians: {
        Args: { target_incident_id: string };
        Returns: Database['public']['Tables']['incident_guardians']['Row'][];
      };
      acknowledge_incident: {
        Args: {
          target_incident_id: string;
          response: 'seen' | 'responding' | 'cannot_respond';
        };
        Returns: Database['public']['Tables']['incident_guardians']['Row'][];
      };
      acknowledge_incident_from_notification: {
        Args: {
          target_incident_id: string;
          response: 'seen' | 'responding' | 'cannot_respond' | 'open_location';
        };
        Returns: Database['public']['Tables']['incident_guardians']['Row'][];
      };
      get_guardian_profile_summary: {
        Args: { target_profile_id: string };
        Returns: { id: string; full_name: string; phone: string | null; avatar_url: string | null }[];
      };
      preview_guardian_invitation: {
        Args: { invitation_code: string };
        Returns: { relationship_id: string; protected_user_name: string; relationship: string | null; created_at: string }[];
      };
      record_emergency_call_handoff: {
        Args: { target_incident_id: string };
        Returns: undefined;
      };
      record_responder_simulation: {
        Args: { target_incident_id: string; simulated_status: string };
        Returns: undefined;
      };
      create_or_restore_incident: {
        Args: {
          activation_id: string;
          requested_activation_source: string;
          requested_is_demo: boolean;
          requested_latitude?: number | null;
          requested_longitude?: number | null;
          requested_accuracy?: number | null;
        };
        Returns: Database['public']['Tables']['incidents']['Row'];
      };
      resolve_incident_idempotent: {
        Args: { target_incident_id: string };
        Returns: Database['public']['Tables']['incidents']['Row'];
      };
      append_active_incident_location: {
        Args: {
          target_incident_id: string;
          requested_latitude: number;
          requested_longitude: number;
          requested_accuracy?: number | null;
          requested_recorded_at?: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
