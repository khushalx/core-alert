import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  createGuardianInvitation,
  getGuardianProfileSummary,
  getIncomingGuardianRequests,
  getOwnedGuardianRelationships,
  getPeopleIProtect,
  importPendingFirstGuardian,
  removeGuardianRelationship,
  respondToGuardianInvitation,
  setPrimaryGuardian,
  type GuardianInvitationInput,
} from '@/services/guardianService';
import {
  acknowledgeIncident,
  getActiveIncident,
  getAssignedActiveIncidents,
  getIncidentById,
  getIncidentEscalationEvents,
  getIncidentGuardians,
  getIncidentHistory,
  getIncidentLocations,
  getIncidentRecipients,
  subscribeToIncident,
  subscribeToIncidentGuardians,
  subscribeToIncidentDelivery,
  subscribeToIncidentLocations,
  subscribeToNewGuardianIncidents,
} from '@/services/incidentService';
import {
  configureGuardianNotifications,
  getNotificationPermissionState,
  installNotificationObservers,
  installPushTokenObserver,
  registerForPushNotifications,
} from '@/services/notificationService';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import type {
  ActiveGuardianAlert,
  CloudIncident,
  ConnectionState,
  GuardianRelationship,
  IncidentGuardian,
  IncidentEscalationEvent,
  IncidentRecipient,
  NotificationPermissionState,
  PushTokenState,
} from '@/types/cloud';

type CloudCache = {
  guardians: GuardianRelationship[];
  incidents: CloudIncident[];
  activeIncident: CloudIncident | null;
  incidentGuardians: IncidentGuardian[];
  incidentRecipients: IncidentRecipient[];
  incidentEvents: IncidentEscalationEvent[];
};

type ConnectedContextValue = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  connection: ConnectionState;
  guardians: GuardianRelationship[];
  incomingRequests: GuardianRelationship[];
  peopleIProtect: GuardianRelationship[];
  incidents: CloudIncident[];
  activeIncident: CloudIncident | null;
  incidentGuardians: IncidentGuardian[];
  incidentRecipients: IncidentRecipient[];
  incidentEvents: IncidentEscalationEvent[];
  guardianAlert: ActiveGuardianAlert | null;
  notificationPermission: NotificationPermissionState;
  pushTokenState: PushTokenState;
  pushMessage: string;
  profileMigrationAvailable: boolean;
  hasLocalDemoGuardians: boolean;
  refresh: () => Promise<void>;
  createGuardian: (input: GuardianInvitationInput) => Promise<GuardianRelationship>;
  respondToInvite: (code: string, decision: 'accepted' | 'declined') => Promise<void>;
  makePrimary: (relationshipId: string) => Promise<void>;
  removeGuardian: (relationshipId: string) => Promise<void>;
  registerPush: () => Promise<void>;
  respondToIncident: (incidentId: string, response: 'responding' | 'cannot_respond') => Promise<void>;
  importLocalProfile: () => Promise<void>;
  dismissLocalProfileImport: () => Promise<void>;
};

const ConnectedContext = createContext<ConnectedContextValue | null>(null);
const cacheKey = (userId: string) => `@core-alert/cloud-cache:${userId}`;
const migrationKey = (userId: string) => `@core-alert/profile-migration:${userId}`;

export function ConnectedProvider({ children }: PropsWithChildren) {
  const { user, profile, updateCloudProfile } = useAuth();
  const { state, showToast } = useApp();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connected');
  const [guardians, setGuardians] = useState<GuardianRelationship[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<GuardianRelationship[]>([]);
  const [peopleIProtect, setPeopleIProtect] = useState<GuardianRelationship[]>([]);
  const [incidents, setIncidents] = useState<CloudIncident[]>([]);
  const [activeIncident, setActiveIncident] = useState<CloudIncident | null>(null);
  const [incidentGuardians, setIncidentGuardians] = useState<IncidentGuardian[]>([]);
  const [incidentRecipients, setIncidentRecipients] = useState<IncidentRecipient[]>([]);
  const [incidentEvents, setIncidentEvents] = useState<IncidentEscalationEvent[]>([]);
  const [guardianAlert, setGuardianAlert] = useState<ActiveGuardianAlert | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>('unknown');
  const [pushTokenState, setPushTokenState] = useState<PushTokenState>('not-registered');
  const [pushMessage, setPushMessage] = useState('Notifications are not configured on this device.');
  const [migrationDismissed, setMigrationDismissed] = useState(true);
  const activeRefresh = useRef(0);

  const persistCache = useCallback(async (next: CloudCache) => {
    if (!user) return;
    await AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next));
  }, [user]);

  const loadGuardianAlert = useCallback(async (incidentId: string) => {
    if (!user) return;
    const incident = await getIncidentById(incidentId);
    if (!incident || incident.status !== 'active') {
      setGuardianAlert((current) => current?.incident.id === incidentId ? null : current);
      return;
    }
    const [assignments, locations, owner] = await Promise.all([
      getIncidentGuardians(incidentId),
      getIncidentLocations(incidentId),
      getGuardianProfileSummary(incident.user_id),
    ]);
    let assignment = assignments.find((item) => item.guardian_user_id === user.id);
    if (!assignment) return;
    if (assignment.acknowledgement_status === 'not_acknowledged') {
      assignment = await acknowledgeIncident(incidentId, 'seen');
    }
    setGuardianAlert({ incident, locations, owner, assignment });
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const refreshId = ++activeRefresh.current;
    setRefreshing(true);
    try {
      const [nextGuardians, nextRequests, nextProtected, nextIncidents, nextActive, assigned] = await Promise.all([
        getOwnedGuardianRelationships(),
        getIncomingGuardianRequests(),
        getPeopleIProtect(),
        getIncidentHistory(),
        getActiveIncident(),
        getAssignedActiveIncidents(),
      ]);
      if (refreshId !== activeRefresh.current) return;
      const [nextIncidentGuardians, nextIncidentRecipients, nextIncidentEvents] = nextActive
        ? await Promise.all([
            getIncidentGuardians(nextActive.id),
            getIncidentRecipients(nextActive.id),
            getIncidentEscalationEvents(nextActive.id),
          ])
        : [[], [], []];
      setGuardians(nextGuardians);
      setIncomingRequests(nextRequests);
      setPeopleIProtect(nextProtected);
      setIncidents(nextIncidents);
      setActiveIncident(nextActive);
      setIncidentGuardians(nextIncidentGuardians);
      setIncidentRecipients(nextIncidentRecipients);
      setIncidentEvents(nextIncidentEvents);
      const assignedIncidents = await Promise.all(assigned.slice(0, 10).map((item) => getIncidentById(item.incident_id)));
      const activeAssigned = assignedIncidents.find((item) => item?.status === 'active');
      if (activeAssigned) await loadGuardianAlert(activeAssigned.id);
      else setGuardianAlert(null);
      setError(null);
      setConnection('connected');
      await persistCache({
        guardians: nextGuardians,
        incidents: nextIncidents,
        activeIncident: nextActive,
        incidentGuardians: nextIncidentGuardians,
        incidentRecipients: nextIncidentRecipients,
        incidentEvents: nextIncidentEvents,
      });
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Connected safety data could not be refreshed.');
      setConnection('reconnecting');
    } finally {
      if (refreshId === activeRefresh.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [loadGuardianAlert, persistCache, user]);

  useEffect(() => {
    if (!user) {
      setGuardians([]); setIncomingRequests([]); setPeopleIProtect([]); setIncidents([]);
      setActiveIncident(null); setIncidentGuardians([]); setIncidentRecipients([]); setIncidentEvents([]); setGuardianAlert(null); setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    AsyncStorage.getItem(cacheKey(user.id)).then((raw) => {
      if (!raw || !active) return;
      try {
        const cached = JSON.parse(raw) as CloudCache;
        setGuardians(cached.guardians ?? []); setIncidents(cached.incidents ?? []);
        setActiveIncident(cached.activeIncident ?? null); setIncidentGuardians(cached.incidentGuardians ?? []);
        setIncidentRecipients(cached.incidentRecipients ?? []); setIncidentEvents(cached.incidentEvents ?? []);
      } catch { /* Ignore invalid cache and refresh from Supabase. */ }
    }).finally(() => { if (active) void refresh(); });
    void importPendingFirstGuardian().then((created) => {
      if (created && active) showToast('Your first guardian invitation is ready to share');
    }).catch((importError) => {
      if (active && __DEV__) console.warn('Pending guardian import failed', importError instanceof Error ? importError.message : 'unknown');
    });
    void configureGuardianNotifications().catch(() => undefined);
    // A guardian cannot receive an out-of-app SOS until this installation has
    // both notification permission and a cloud push token. Register at signed-
    // in startup instead of relying on the user discovering a Settings row.
    // The OS owns the permission prompt and the token upsert is idempotent.
    void registerForPushNotifications(user.id).then((result) => {
      if (!active) return;
      setNotificationPermission(result.permission);
      setPushTokenState(result.tokenState);
      setPushMessage(result.message);
    }).catch((registrationError) => {
      if (!active) return;
      setPushTokenState('error');
      setPushMessage(registrationError instanceof Error
        ? registrationError.message
        : 'Push notifications could not be configured on this device.');
    });
    void AsyncStorage.getItem(migrationKey(user.id)).then((value) => { if (active) setMigrationDismissed(value === 'complete' || value === 'dismissed'); });
    return () => { active = false; activeRefresh.current += 1; };
  }, [refresh, showToast, user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToNewGuardianIncidents(user.id, (incidentId) => {
      void loadGuardianAlert(incidentId);
      showToast('A protected user has started an SOS');
    }, setConnection);
  }, [loadGuardianAlert, showToast, user]);

  useEffect(() => {
    const incidentId = activeIncident?.id;
    if (!incidentId) return;
    const refreshActive = () => void refresh();
    const stopIncident = subscribeToIncident(incidentId, refreshActive, setConnection);
    const stopGuardians = subscribeToIncidentGuardians(incidentId, refreshActive, setConnection);
    const stopDelivery = subscribeToIncidentDelivery(incidentId, refreshActive, setConnection);
    return () => { stopIncident(); stopGuardians(); stopDelivery(); };
  }, [activeIncident?.id, refresh]);

  const localActiveIncidentId =
    state.sosState.stage === 'active' ||
    state.sosState.stage === 'ending' ||
    state.sosState.stage === 'ending_failed'
      ? state.sosState.incidentId
      : null;
  useEffect(() => {
    if (localActiveIncidentId && activeIncident?.id !== localActiveIncidentId) void refresh();
  }, [activeIncident?.id, localActiveIncidentId, refresh]);

  useEffect(() => {
    const incidentId = guardianAlert?.incident.id;
    if (!incidentId) return;
    const reload = () => void loadGuardianAlert(incidentId);
    const stopIncident = subscribeToIncident(incidentId, reload, setConnection);
    const stopLocations = subscribeToIncidentLocations(incidentId, reload, setConnection);
    return () => { stopIncident(); stopLocations(); };
  }, [guardianAlert?.incident.id, loadGuardianAlert]);

  useEffect(() => {
    const unsubscribeNetwork = NetInfo.addEventListener((network) => {
      if (network.isConnected === false) setConnection('offline');
      else if (network.isInternetReachable === false) setConnection('reconnecting');
      else { setConnection('connected'); if (user) void refresh(); }
    });
    const removeNotifications = user ? installNotificationObservers((url) => router.push(url as never)) : () => undefined;
    const removePushTokenObserver = user ? installPushTokenObserver(user.id) : () => undefined;
    return () => { unsubscribeNetwork(); removeNotifications(); removePushTokenObserver(); };
  }, [refresh, user]);

  const createGuardian = useCallback(async (input: GuardianInvitationInput) => {
    const created = await createGuardianInvitation(input);
    await refresh();
    return created;
  }, [refresh]);
  const respondToInvite = useCallback(async (code: string, decision: 'accepted' | 'declined') => {
    await respondToGuardianInvitation(code, decision); await refresh();
  }, [refresh]);
  const makePrimary = useCallback(async (id: string) => { await setPrimaryGuardian(id); await refresh(); }, [refresh]);
  const removeGuardian = useCallback(async (id: string) => { await removeGuardianRelationship(id); await refresh(); }, [refresh]);
  const registerPush = useCallback(async () => {
    if (!user) throw new Error('Sign in before enabling notifications.');
    const result = await registerForPushNotifications(user.id);
    setNotificationPermission(result.permission); setPushTokenState(result.tokenState); setPushMessage(result.message);
    if (result.tokenState === 'registered') showToast('Notifications are ready');
  }, [showToast, user]);
  const respondToIncident = useCallback(async (incidentId: string, response: 'responding' | 'cannot_respond') => {
    await acknowledgeIncident(incidentId, response); await loadGuardianAlert(incidentId);
  }, [loadGuardianAlert]);

  const localProfileHasDetails = Boolean(state.profile.phone || state.profile.bloodGroup || state.profile.allergies || state.profile.medicalNotes);
  const cloudProfileNeedsDetails = Boolean(profile && !profile.phone && !profile.blood_group && !profile.allergies && !profile.medical_notes);
  const profileMigrationAvailable = !migrationDismissed && localProfileHasDetails && cloudProfileNeedsDetails;
  const importLocalProfile = useCallback(async () => {
    if (!user) return;
    await updateCloudProfile({
      full_name: state.profile.fullName || profile?.full_name || 'Core Alert user',
      phone: state.profile.phone || null,
      blood_group: state.profile.bloodGroup || null,
      allergies: state.profile.allergies || null,
      medical_notes: state.profile.medicalNotes || null,
      preferred_language: state.profile.preferredLanguage || 'English',
    });
    await AsyncStorage.setItem(migrationKey(user.id), 'complete'); setMigrationDismissed(true); showToast('Local emergency profile imported');
  }, [profile?.full_name, showToast, state.profile, updateCloudProfile, user]);
  const dismissLocalProfileImport = useCallback(async () => {
    if (!user) return; await AsyncStorage.setItem(migrationKey(user.id), 'dismissed'); setMigrationDismissed(true);
  }, [user]);

  const value = useMemo<ConnectedContextValue>(() => ({
    loading, refreshing, error, connection, guardians, incomingRequests, peopleIProtect, incidents, activeIncident,
    incidentGuardians, incidentRecipients, incidentEvents, guardianAlert, notificationPermission, pushTokenState, pushMessage, profileMigrationAvailable,
    hasLocalDemoGuardians: state.guardians.some((item) => item.id.startsWith('guardian-maya') || item.id.startsWith('guardian-arjun')),
    refresh, createGuardian, respondToInvite, makePrimary, removeGuardian, registerPush, respondToIncident,
    importLocalProfile, dismissLocalProfileImport,
  }), [activeIncident, connection, createGuardian, dismissLocalProfileImport, error, guardianAlert, guardians, importLocalProfile, incidentEvents, incidentGuardians, incidentRecipients, incomingRequests, incidents, loading, makePrimary, notificationPermission, peopleIProtect, profileMigrationAvailable, pushMessage, pushTokenState, refresh, refreshing, removeGuardian, registerPush, respondToIncident, state.guardians]);

  return <ConnectedContext.Provider value={value}>{children}</ConnectedContext.Provider>;
}

export function useConnected(): ConnectedContextValue {
  const value = useContext(ConnectedContext);
  if (!value) throw new Error('useConnected must be used within ConnectedProvider');
  return value;
}
