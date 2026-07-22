import type { Database } from '@/types/database';

export type CloudProfile = Database['public']['Tables']['profiles']['Row'];
export type GuardianRelationship = Database['public']['Tables']['guardian_relationships']['Row'];
export type CloudIncident = Database['public']['Tables']['incidents']['Row'];
export type IncidentLocation = Database['public']['Tables']['incident_locations']['Row'];
export type IncidentGuardian = Database['public']['Tables']['incident_guardians']['Row'];

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';
export type NotificationPermissionState = 'unknown' | 'granted' | 'denied' | 'unavailable';
export type PushTokenState = 'not-registered' | 'registered' | 'error';

export type GuardianProfileSummary = {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
};

export type GuardianAssignmentView = IncidentGuardian & {
  guardianName?: string;
};

export type ActiveGuardianAlert = {
  incident: CloudIncident;
  owner: GuardianProfileSummary | null;
  assignment: IncidentGuardian;
  locations: IncidentLocation[];
};
