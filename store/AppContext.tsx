import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { requestEmergencyTrigger } from '@/services/emergencyTrigger';
import { hardwareTriggerService } from '@/services/hardwareTriggerService';
import {
  assignGuardiansToIncident,
  createIncident,
  getActiveIncident,
  resolveIncident,
  sendIncidentNotifications,
  updateIncidentLocation,
  type IncidentPoint,
} from '@/services/incidentService';
import { liveLocationService } from '@/services/liveLocationService';
import { offlineLocationQueue } from '@/services/offlineLocationQueue';
import { useAuth } from '@/store/AuthContext';
import type {
  EmergencyProfile,
  Guardian,
  Incident,
  LocationState,
  PersistedAppState,
  SOSActivationSource,
  SosState,
} from '@/types';

const STORAGE_KEY = '@core-alert/phase-1-state';

const mockGuardians: Guardian[] = [
  {
    id: 'guardian-maya',
    fullName: 'Maya Sharma',
    relationship: 'Sister',
    phone: '+91 98765 43210',
    email: 'maya@example.com',
    isPrimary: true,
    notificationsEnabled: true,
  },
  {
    id: 'guardian-arjun',
    fullName: 'Arjun Mehta',
    relationship: 'Close friend',
    phone: '+91 99887 76655',
    email: 'arjun@example.com',
    isPrimary: false,
    notificationsEnabled: true,
  },
];

const mockIncidents: Incident[] = [
  {
    id: 'mock-test-completed',
    kind: 'test',
    status: 'completed',
    startedAt: '2026-07-21T14:28:00.000Z',
    endedAt: '2026-07-21T14:29:42.000Z',
    incidentCoordinates: { latitude: 19.076, longitude: 72.8777 },
    currentCoordinates: { latitude: 19.0763, longitude: 72.8781 },
    locationLabel: 'Bandra East, Mumbai',
    guardiansNotified: 2,
    activationSource: 'manual-test',
    isDemo: true,
    timeline: [
      'SOS activated',
      'Incident location captured',
      'Guardians notified (simulation)',
      'Live location sharing started (simulation)',
      'Test ended safely',
    ],
  },
  {
    id: 'mock-test-cancelled',
    kind: 'test',
    status: 'cancelled',
    startedAt: '2026-07-18T06:10:00.000Z',
    endedAt: '2026-07-18T06:10:05.000Z',
    incidentCoordinates: null,
    currentCoordinates: null,
    locationLabel: 'Cancelled before activation',
    guardiansNotified: 0,
    activationSource: 'manual-test',
    isDemo: true,
    timeline: ['Test countdown started', 'Test cancelled'],
  },
];

const defaultProfile: EmergencyProfile = {
  fullName: 'Aarav',
  phone: '',
  bloodGroup: '',
  allergies: '',
  medicalNotes: '',
  preferredLanguage: 'English',
};

const initialPersistedState: PersistedAppState = {
  onboardingComplete: false,
  guardians: mockGuardians,
  profile: defaultProfile,
  incidents: mockIncidents,
  preferences: {
    countdownDuration: 10,
    hapticsEnabled: true,
    hardwareShortcutEnabled: true,
    hardwareHapticsEnabled: true,
    demoModeEnabled: true,
  },
  sosState: { stage: 'idle' },
};

const initialLocation: LocationState = {
  permission: 'unknown',
  coordinates: null,
  loading: false,
  error: null,
};

type ToastMessage = { id: number; message: string } | null;

type AppContextValue = {
  hydrated: boolean;
  storageError: string | null;
  state: PersistedAppState;
  location: LocationState;
  toast: ToastMessage;
  completeOnboarding: () => void;
  requestLocationPermission: () => Promise<boolean>;
  refreshLocation: () => Promise<void>;
  addGuardian: (guardian: Omit<Guardian, 'id' | 'notificationsEnabled'>) => void;
  updateGuardian: (id: string, guardian: Omit<Guardian, 'id' | 'notificationsEnabled'>) => void;
  removeGuardian: (id: string) => void;
  updateProfile: (profile: EmergencyProfile) => void;
  setCountdownDuration: (duration: 5 | 10 | 15) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setHardwareShortcutEnabled: (enabled: boolean) => void;
  setHardwareHapticsEnabled: (enabled: boolean) => void;
  setDemoModeEnabled: (enabled: boolean) => void;
  startSos: (source: SOSActivationSource) => Promise<boolean>;
  startSosTest: () => Promise<boolean>;
  activateSosTest: () => Promise<void>;
  cancelSosTest: () => void;
  endSosTest: () => Promise<void>;
  resetDemoData: () => Promise<void>;
  removeLocalDemoData: () => void;
  showToast: (message: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function normalizeStoredState(value: Partial<PersistedAppState>): PersistedAppState {
  const storedSosState = value.sosState ?? initialPersistedState.sosState;
  const sosState: SosState = storedSosState.stage === 'idle'
    ? storedSosState
    : storedSosState.stage === 'countdown'
      ? { ...storedSosState, source: storedSosState.source ?? 'manual-test' }
      : storedSosState.incidentId
        ? {
          ...storedSosState,
          source: storedSosState.source ?? 'manual-test',
          incidentId: storedSosState.incidentId,
          isDemo: storedSosState.isDemo ?? true,
          locationStatus: storedSosState.locationStatus ?? 'unavailable',
          guardianStatus: storedSosState.guardianStatus ?? 'none',
          issues: storedSosState.issues ?? [],
        }
        : { stage: 'idle' as const };
  return {
    ...initialPersistedState,
    ...value,
    preferences: { ...initialPersistedState.preferences, ...value.preferences },
    profile: { ...initialPersistedState.profile, ...value.profile },
    incidents: (value.incidents ?? initialPersistedState.incidents).map((incident) => ({
      ...incident,
      activationSource: incident.activationSource ?? 'manual-test',
      isDemo: incident.isDemo ?? true,
    })),
    sosState,
  };
}

export function AppProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [state, setState] = useState<PersistedAppState>(initialPersistedState);
  const [location, setLocation] = useState<LocationState>(initialLocation);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && active) {
          const parsed: Partial<PersistedAppState> = JSON.parse(raw);
          const normalized = normalizeStoredState(parsed);
          if (normalized.sosState.stage === 'countdown') {
            const elapsed = (Date.now() - new Date(normalized.sosState.startedAt).getTime()) / 1000;
            if (elapsed >= normalized.sosState.duration) {
              normalized.sosState = { stage: 'idle' };
            }
          }
          setState(normalized);
        }
      } catch {
        if (active) setStorageError('Demo data could not be restored. New changes may not persist.');
      } finally {
        if (active) setHydrated(true);
      }
    }
    hydrate();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
      setStorageError('Demo data could not be saved on this device.');
    });
  }, [hydrated, state]);

  const refreshLocation = useCallback(async () => {
    setLocation((current) => ({ ...current, loading: true, error: null }));
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocation({ permission: 'denied', coordinates: null, loading: false, error: null });
        return;
      }
      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        permission: 'granted',
        coordinates: {
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
        },
        loading: false,
        error: null,
      });
    } catch {
      setLocation((current) => ({
        ...current,
        loading: false,
        error: 'We could not get your current location. Check device location services and try again.',
      }));
    }
  }, []);

  useEffect(() => {
    if (hydrated) refreshLocation();
  }, [hydrated, refreshLocation]);

  const requestLocationPermission = useCallback(async () => {
    try {
      setLocation((current) => ({ ...current, loading: true, error: null }));
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocation({ permission: 'denied', coordinates: null, loading: false, error: null });
        return false;
      }
      await refreshLocation();
      return true;
    } catch {
      setLocation({
        permission: 'denied',
        coordinates: null,
        loading: false,
        error: 'Location permission could not be requested. You can enable it in device settings.',
      });
      return false;
    }
  }, [refreshLocation]);

  const completeOnboarding = useCallback(() => {
    setState((current) => ({ ...current, onboardingComplete: true }));
  }, []);

  const addGuardian = useCallback<AppContextValue['addGuardian']>((guardian) => {
    setState((current) => {
      const guardians = guardian.isPrimary
        ? current.guardians.map((item) => ({ ...item, isPrimary: false }))
        : current.guardians;
      return {
        ...current,
        guardians: [
          ...guardians,
          { ...guardian, id: `guardian-${Date.now()}`, notificationsEnabled: true },
        ],
      };
    });
    showToast('Guardian saved');
  }, [showToast]);

  const updateGuardian = useCallback<AppContextValue['updateGuardian']>((id, guardian) => {
    setState((current) => ({
      ...current,
      guardians: current.guardians.map((item) =>
        item.id === id
          ? { ...item, ...guardian }
          : guardian.isPrimary
            ? { ...item, isPrimary: false }
            : item,
      ),
    }));
    showToast('Guardian updated');
  }, [showToast]);

  const removeGuardian = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      guardians: current.guardians.filter((guardian) => guardian.id !== id),
    }));
    showToast('Guardian removed');
  }, [showToast]);

  const updateProfile = useCallback((profile: EmergencyProfile) => {
    setState((current) => ({ ...current, profile }));
    showToast('Emergency profile saved');
  }, [showToast]);

  const setCountdownDuration = useCallback((duration: 5 | 10 | 15) => {
    setState((current) => ({
      ...current,
      preferences: { ...current.preferences, countdownDuration: duration },
    }));
  }, []);

  const setHapticsEnabled = useCallback((hapticsEnabled: boolean) => {
    setState((current) => ({
      ...current,
      preferences: { ...current.preferences, hapticsEnabled },
    }));
  }, []);

  const setHardwareShortcutEnabled = useCallback((hardwareShortcutEnabled: boolean) => {
    setState((current) => ({
      ...current,
      preferences: { ...current.preferences, hardwareShortcutEnabled },
    }));
  }, []);

  const setHardwareHapticsEnabled = useCallback((hardwareHapticsEnabled: boolean) => {
    setState((current) => ({
      ...current,
      preferences: { ...current.preferences, hardwareHapticsEnabled },
    }));
  }, []);

  const setDemoModeEnabled = useCallback((demoModeEnabled: boolean) => {
    setState((current) => ({ ...current, preferences: { ...current.preferences, demoModeEnabled } }));
  }, []);

  const startSos = useCallback(async (source: SOSActivationSource) => {
    if (stateRef.current.sosState.stage !== 'idle') return false;
    const trigger = await requestEmergencyTrigger(source);
    setState((current) => {
      if (current.sosState.stage !== 'idle') return current;
      return {
        ...current,
        sosState: {
          stage: 'countdown',
          startedAt: trigger.requestedAt,
          duration: current.preferences.countdownDuration,
          source: trigger.source,
        },
      };
    });
    if (stateRef.current.preferences.hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    }
    return true;
  }, []);

  const startSosTest = useCallback(() => startSos('manual-test'), [startSos]);

  const updateActiveSos = useCallback((incidentId: string, updates: Partial<Extract<SosState, { stage: 'active' }>>) => {
    setState((current) => current.sosState.stage === 'active' && current.sosState.incidentId === incidentId
      ? { ...current, sosState: { ...current.sosState, ...updates } }
      : current);
  }, []);

  const addActiveIssue = useCallback((incidentId: string, issue: string) => {
    setState((current) => {
      if (current.sosState.stage !== 'active' || current.sosState.incidentId !== incidentId) return current;
      if (current.sosState.issues.includes(issue)) return current;
      return { ...current, sosState: { ...current.sosState, issues: [...current.sosState.issues, issue] } };
    });
  }, []);

  const beginLiveLocation = useCallback(async (incidentId: string) => {
    try {
      await liveLocationService.start({
        onLocation: async (point) => {
          try {
            await updateIncidentLocation(incidentId, point);
            updateActiveSos(incidentId, { locationStatus: 'sharing' });
          } catch {
            await offlineLocationQueue.enqueue({
              incidentId,
              latitude: point.latitude,
              longitude: point.longitude,
              accuracy: point.accuracy,
              recordedAt: point.recordedAt ?? new Date().toISOString(),
            });
            updateActiveSos(incidentId, { locationStatus: 'reconnecting' });
          }
        },
        onError: (message) => {
          updateActiveSos(incidentId, { locationStatus: 'reconnecting' });
          addActiveIssue(incidentId, message);
        },
      });
      updateActiveSos(incidentId, { locationStatus: 'sharing' });
    } catch (trackingError) {
      updateActiveSos(incidentId, { locationStatus: 'unavailable' });
      addActiveIssue(incidentId, trackingError instanceof Error ? trackingError.message : 'Live location is unavailable.');
    }
  }, [addActiveIssue, updateActiveSos]);

  const activateSosTest = useCallback(async () => {
    const countdown = stateRef.current.sosState;
    if (countdown.stage !== 'countdown') return;
    if (!user) {
      setState((current) => ({ ...current, sosState: { stage: 'idle' } }));
      showToast('Sign in before starting an SOS');
      return;
    }

    let point: IncidentPoint | null = location.coordinates
      ? { ...location.coordinates, accuracy: null }
      : null;
    const activationIssues: string[] = [];
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === Location.PermissionStatus.GRANTED) {
        const position = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), 6_000)),
        ]);
        point = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
        setLocation({ permission: 'granted', coordinates: { latitude: point.latitude, longitude: point.longitude }, loading: false, error: null });
      } else {
        activationIssues.push('Location permission is not available. The SOS will continue without live location.');
      }
    } catch {
      activationIssues.push('Current location was unavailable. Core Alert will retry during the incident.');
    }

    let incident;
    try {
      incident = await createIncident({
        activationSource: countdown.source,
        isDemo: stateRef.current.preferences.demoModeEnabled,
        location: point,
      });
    } catch (incidentError) {
      setState((current) => ({ ...current, sosState: { stage: 'idle' } }));
      hardwareTriggerService.reset('Incident creation failed', true);
      showToast(incidentError instanceof Error ? incidentError.message : 'The SOS could not be created.');
      return;
    }

    setState((current) => ({
      ...current,
      sosState: {
        stage: 'active',
        startedAt: incident.started_at,
        incidentCoordinates: point ? { latitude: point.latitude, longitude: point.longitude } : null,
        source: countdown.source,
        incidentId: incident.id,
        isDemo: incident.is_demo,
        locationStatus: point ? 'sharing' : 'unavailable',
        guardianStatus: 'assigning',
        issues: activationIssues,
      },
    }));

    void (async () => {
      try {
        const assignments = await assignGuardiansToIncident(incident.id);
        if (assignments.length === 0) {
          updateActiveSos(incident.id, { guardianStatus: 'none' });
          addActiveIssue(incident.id, 'No accepted linked guardians were available for this SOS.');
          return;
        }
        updateActiveSos(incident.id, { guardianStatus: 'alerting' });
        try {
          const delivery = await sendIncidentNotifications(incident.id);
          updateActiveSos(incident.id, { guardianStatus: delivery.delivered > 0 ? 'ready' : 'failed' });
          if (delivery.failed > 0) addActiveIssue(incident.id, `${delivery.failed} guardian notification${delivery.failed === 1 ? '' : 's'} could not be delivered.`);
        } catch (notificationError) {
          updateActiveSos(incident.id, { guardianStatus: 'failed' });
          addActiveIssue(incident.id, notificationError instanceof Error ? notificationError.message : 'Guardian notification delivery failed.');
        }
      } catch (assignmentError) {
        updateActiveSos(incident.id, { guardianStatus: 'failed' });
        addActiveIssue(incident.id, assignmentError instanceof Error ? assignmentError.message : 'Guardians could not be assigned.');
      }
    })();
    void beginLiveLocation(incident.id);
  }, [addActiveIssue, beginLiveLocation, location.coordinates, showToast, updateActiveSos, user]);

  const cancelSosTest = useCallback(() => {
    const countdown = stateRef.current.sosState;
    if (countdown.stage === 'countdown' && user) {
      void createIncident({
        activationSource: countdown.source,
        isDemo: stateRef.current.preferences.demoModeEnabled,
        status: 'cancelled',
        cancelledDuringCountdown: true,
      }).catch((error) => {
        if (__DEV__) console.warn('Cancelled incident could not be stored', error instanceof Error ? error.message : 'unknown');
      });
    }
    setState((current) => {
      if (current.sosState.stage !== 'countdown') return current;
      const source = current.sosState.source;
      const shouldRecord = current.preferences.demoModeEnabled && source !== 'manual-test';
      const cancelledIncident: Incident = {
        id: `test-cancelled-${Date.now()}`,
        kind: 'test',
        status: 'cancelled',
        startedAt: current.sosState.startedAt,
        endedAt: new Date().toISOString(),
        incidentCoordinates: null,
        currentCoordinates: null,
        locationLabel: 'Cancelled before activation',
        guardiansNotified: 0,
        timeline: ['SOS countdown started', 'SOS cancelled before activation'],
        activationSource: source,
        isDemo: true,
      };
      return {
        ...current,
        sosState: { stage: 'idle' },
        incidents: shouldRecord ? [cancelledIncident, ...current.incidents] : current.incidents,
      };
    });
    hardwareTriggerService.reset('Countdown cancelled', true);
    showToast('SOS test cancelled');
  }, [showToast, user]);

  const endSosTest = useCallback(async () => {
    const active = stateRef.current.sosState;
    if (active.stage !== 'active') return;
    if (active.incidentId) {
      try {
        await resolveIncident(active.incidentId);
      } catch (resolutionError) {
        addActiveIssue(active.incidentId, resolutionError instanceof Error ? resolutionError.message : 'The SOS could not be ended.');
        showToast('The SOS is still active. Check your connection and try again.');
        return;
      }
    }
    await liveLocationService.stop();
    setState((current) => {
      if (current.sosState.stage !== 'active') return current;
      const now = new Date().toISOString();
      const incident: Incident = {
        id: `test-${Date.now()}`,
        kind: 'test',
        status: 'completed',
        startedAt: current.sosState.startedAt,
        endedAt: now,
        incidentCoordinates: current.sosState.incidentCoordinates,
        currentCoordinates: location.coordinates,
        locationLabel: current.sosState.incidentCoordinates ? 'Current device location' : 'Location unavailable',
        guardiansNotified: current.guardians.filter((guardian) => guardian.notificationsEnabled).length,
        activationSource: current.sosState.source,
        isDemo: current.preferences.demoModeEnabled,
        timeline: [
          'SOS activated',
          'Incident location captured',
          'Connected incident created',
          current.sosState.locationStatus === 'sharing' ? 'Live location sharing started' : 'Live location unavailable',
          'SOS ended safely',
        ],
      };
      return {
        ...current,
        sosState: { stage: 'idle' },
        incidents: [incident, ...current.incidents],
      };
    });
    hardwareTriggerService.reset('SOS test ended', true);
    showToast('SOS ended and saved to Activity');
    if (stateRef.current.preferences.hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  }, [addActiveIssue, location.coordinates, showToast]);

  useEffect(() => {
    if (!hydrated || !user) return;
    let active = true;
    void getActiveIncident().then((incident) => {
      if (!active || !incident || stateRef.current.sosState.stage !== 'idle') return;
      const source: SOSActivationSource = incident.activation_source === 'volume-shortcut'
        || incident.activation_source === 'developer-simulation'
        ? incident.activation_source
        : 'manual-test';
      setState((current) => ({
        ...current,
        sosState: {
          stage: 'active',
          startedAt: incident.started_at,
          incidentCoordinates: incident.incident_latitude !== null && incident.incident_longitude !== null
            ? { latitude: incident.incident_latitude, longitude: incident.incident_longitude }
            : null,
          source,
          incidentId: incident.id,
          isDemo: incident.is_demo,
          locationStatus: 'reconnecting',
          guardianStatus: 'ready',
          issues: ['Restored the active SOS after reopening Core Alert.'],
        },
      }));
      void beginLiveLocation(incident.id);
    }).catch((restoreError) => {
      if (__DEV__) console.warn('Active incident restoration failed', restoreError instanceof Error ? restoreError.message : 'unknown');
    });
    return () => { active = false; };
  }, [beginLiveLocation, hydrated, user]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = NetInfo.addEventListener((network) => {
      if (!network.isConnected || network.isInternetReachable === false) return;
      void offlineLocationQueue.flush(async (queued) => {
        await updateIncidentLocation(queued.incidentId, {
          latitude: queued.latitude,
          longitude: queued.longitude,
          accuracy: queued.accuracy,
          recordedAt: queued.recordedAt,
        });
      }).then(({ sent }) => {
        const current = stateRef.current.sosState;
        if (sent > 0 && current.stage === 'active' && current.incidentId) {
          updateActiveSos(current.incidentId, { locationStatus: 'sharing' });
        }
      });
    });
    return unsubscribe;
  }, [updateActiveSos, user]);

  useEffect(() => () => { void liveLocationService.stop(); }, []);

  useEffect(() => {
    hardwareTriggerService.configure({
      onActivate: async (source) => {
        await startSos(source);
      },
      onPress: (pressCount) => {
        const preferences = stateRef.current.preferences;
        if (!preferences.hapticsEnabled || !preferences.hardwareHapticsEnabled) return;
        if (pressCount === hardwareTriggerService.threshold) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        } else {
          Haptics.selectionAsync().catch(() => undefined);
        }
      },
      onPracticeComplete: () => showToast('Shortcut detected successfully'),
    });
  }, [showToast, startSos]);

  useEffect(() => {
    if (!hydrated) return;
    hardwareTriggerService.setContext({
      enabled: state.preferences.hardwareShortcutEnabled,
      sosBusy: state.sosState.stage !== 'idle',
    });
    if (AppState.currentState === 'active') void hardwareTriggerService.verifyAndAttach();
  }, [hydrated, state.preferences.hardwareShortcutEnabled, state.sosState.stage]);

  useEffect(() => {
    if (!hydrated) return;
    const syncAppState = (nextState: string) => {
      const appState = nextState === 'active' || nextState === 'background' || nextState === 'inactive'
        ? nextState
        : 'unknown';
      hardwareTriggerService.setAppState(appState);
      if (appState === 'active') {
        hardwareTriggerService.reset('Foreground listener restarted');
        void hardwareTriggerService.verifyAndAttach();
      } else {
        void hardwareTriggerService.detach('Foreground listener detached');
      }
    };
    syncAppState(AppState.currentState);
    const subscription = AppState.addEventListener('change', syncAppState);
    return () => {
      subscription.remove();
      void hardwareTriggerService.detach('Application provider unmounted');
    };
  }, [hydrated]);

  const resetDemoData = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setState({ ...initialPersistedState, onboardingComplete: true });
    setStorageError(null);
    showToast('Demo data reset');
  }, [showToast]);

  const removeLocalDemoData = useCallback(() => {
    setState((current) => ({
      ...current,
      guardians: current.guardians.filter((guardian) => !['guardian-maya', 'guardian-arjun'].includes(guardian.id)),
      incidents: current.incidents.filter((incident) => !incident.id.startsWith('mock-')),
    }));
    showToast('Local demo records removed');
  }, [showToast]);

  const value = useMemo<AppContextValue>(() => ({
    hydrated,
    storageError,
    state,
    location,
    toast,
    completeOnboarding,
    requestLocationPermission,
    refreshLocation,
    addGuardian,
    updateGuardian,
    removeGuardian,
    updateProfile,
    setCountdownDuration,
    setHapticsEnabled,
    setHardwareShortcutEnabled,
    setHardwareHapticsEnabled,
    setDemoModeEnabled,
    startSos,
    startSosTest,
    activateSosTest,
    cancelSosTest,
    endSosTest,
    resetDemoData,
    removeLocalDemoData,
    showToast,
  }), [
    hydrated,
    storageError,
    state,
    location,
    toast,
    completeOnboarding,
    requestLocationPermission,
    refreshLocation,
    addGuardian,
    updateGuardian,
    removeGuardian,
    updateProfile,
    setCountdownDuration,
    setHapticsEnabled,
    setHardwareShortcutEnabled,
    setHardwareHapticsEnabled,
    setDemoModeEnabled,
    startSos,
    startSosTest,
    activateSosTest,
    cancelSosTest,
    endSosTest,
    resetDemoData,
    removeLocalDemoData,
    showToast,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}
