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
      get_guardian_profile_summary: {
        Args: { target_profile_id: string };
        Returns: { id: string; full_name: string; phone: string | null; avatar_url: string | null }[];
      };
      preview_guardian_invitation: {
        Args: { invitation_code: string };
        Returns: { relationship_id: string; protected_user_name: string; relationship: string | null; created_at: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
