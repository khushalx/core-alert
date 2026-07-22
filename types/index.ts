export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type Guardian = {
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  notificationsEnabled: boolean;
};

export type EmergencyProfile = {
  fullName: string;
  phone: string;
  bloodGroup: string;
  allergies: string;
  medicalNotes: string;
  preferredLanguage: string;
};

export type IncidentStatus = 'completed' | 'cancelled';

export type Incident = {
  id: string;
  kind: 'test' | 'alert';
  status: IncidentStatus;
  startedAt: string;
  endedAt: string;
  incidentCoordinates: Coordinates | null;
  currentCoordinates: Coordinates | null;
  locationLabel: string;
  guardiansNotified: number;
  timeline: string[];
  activationSource: SOSActivationSource;
  isDemo: boolean;
};

export type SOSActivationSource =
  | 'manual-test'
  | 'volume-shortcut'
  | 'developer-simulation';

export type AppPreferences = {
  countdownDuration: 5 | 10 | 15;
  hapticsEnabled: boolean;
  hardwareShortcutEnabled: boolean;
  hardwareHapticsEnabled: boolean;
  demoModeEnabled: boolean;
};

export type SosState =
  | { stage: 'idle' }
  | {
      stage: 'countdown';
      startedAt: string;
      duration: number;
      source: SOSActivationSource;
    }
  | {
      stage: 'active';
      startedAt: string;
      incidentCoordinates: Coordinates | null;
      source: SOSActivationSource;
      incidentId: string | null;
      isDemo: boolean;
      locationStatus: 'sharing' | 'reconnecting' | 'unavailable';
      guardianStatus: 'assigning' | 'alerting' | 'ready' | 'none' | 'failed';
      issues: string[];
    };

export type PersistedAppState = {
  onboardingComplete: boolean;
  guardians: Guardian[];
  profile: EmergencyProfile;
  incidents: Incident[];
  preferences: AppPreferences;
  sosState: SosState;
};

export type LocationState = {
  permission: 'unknown' | 'granted' | 'denied';
  coordinates: Coordinates | null;
  loading: boolean;
  error: string | null;
};
