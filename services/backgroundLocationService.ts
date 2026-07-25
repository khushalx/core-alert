import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';

import { shouldPersistLocation, updateIncidentLocation, type IncidentPoint } from '@/services/incidentService';
import { offlineLocationQueue } from '@/services/offlineLocationQueue';

export const BACKGROUND_LOCATION_TASK = 'core-alert-active-incident-location';

const ACTIVE_INCIDENT_KEY = '@core-alert/background-location-incident';
const BACKGROUND_STATE_KEY = '@core-alert/background-location-state';

export type BackgroundLocationState = {
  available: boolean;
  permission: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  running: boolean;
  incidentId: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};

type StoredTaskState = Pick<BackgroundLocationState, 'lastAttemptAt' | 'lastSuccessAt' | 'lastError'> & {
  previousPoint: IncidentPoint | null;
  previousAt: number | null;
};

const emptyTaskState: StoredTaskState = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  previousPoint: null,
  previousAt: null,
};

async function readTaskState(): Promise<StoredTaskState> {
  const raw = await AsyncStorage.getItem(BACKGROUND_STATE_KEY);
  if (!raw) return emptyTaskState;
  try {
    return { ...emptyTaskState, ...JSON.parse(raw) as Partial<StoredTaskState> };
  } catch {
    return emptyTaskState;
  }
}

async function writeTaskState(state: StoredTaskState): Promise<void> {
  await AsyncStorage.setItem(BACKGROUND_STATE_KEY, JSON.stringify(state));
}

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    const attemptedAt = new Date().toISOString();
    const previousState = await readTaskState();
    if (error) {
      await writeTaskState({ ...previousState, lastAttemptAt: attemptedAt, lastError: error.message });
      return;
    }

    // The foreground watcher owns updates while a React tree is active. This task
    // is the handoff for an active incident after Android backgrounds the app.
    if (AppState.currentState === 'active') return;

    const incidentId = await AsyncStorage.getItem(ACTIVE_INCIDENT_KEY);
    if (!incidentId || !data?.locations?.length) return;

    let taskState = previousState;
    for (const location of data.locations) {
      const point: IncidentPoint = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        recordedAt: new Date(location.timestamp).toISOString(),
      };
      if (!shouldPersistLocation(taskState.previousPoint, point, taskState.previousAt, location.timestamp, {
        minTimeMs: 10_000,
        minDistanceMeters: 15,
      })) continue;

      taskState = { ...taskState, previousPoint: point, previousAt: location.timestamp, lastAttemptAt: attemptedAt };
      try {
        await updateIncidentLocation(incidentId, point);
        taskState = { ...taskState, lastSuccessAt: new Date().toISOString(), lastError: null };
      } catch {
        await offlineLocationQueue.enqueue({
          incidentId,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
          recordedAt: point.recordedAt ?? attemptedAt,
        });
        taskState = { ...taskState, lastError: 'Location queued until the connection returns.' };
      }
    }
    await writeTaskState(taskState);
  });
}

function permissionLabel(status: Location.PermissionStatus): BackgroundLocationState['permission'] {
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export async function getBackgroundLocationState(): Promise<BackgroundLocationState> {
  if (Platform.OS !== 'android') {
    return { available: false, permission: 'unavailable', running: false, incidentId: null, lastAttemptAt: null, lastSuccessAt: null, lastError: null };
  }
  const [available, permission, running, incidentId, taskState] = await Promise.all([
    Location.isBackgroundLocationAvailableAsync().catch(() => false),
    Location.getBackgroundPermissionsAsync(),
    Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false),
    AsyncStorage.getItem(ACTIVE_INCIDENT_KEY),
    readTaskState(),
  ]);
  return {
    available,
    permission: permissionLabel(permission.status),
    running,
    incidentId,
    lastAttemptAt: taskState.lastAttemptAt,
    lastSuccessAt: taskState.lastSuccessAt,
    lastError: taskState.lastError,
  };
}

export async function requestBackgroundLocationPermission(): Promise<BackgroundLocationState> {
  if (Platform.OS !== 'android') return getBackgroundLocationState();
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    throw new Error('Allow location while using Core Alert before enabling background sharing.');
  }
  await Location.requestBackgroundPermissionsAsync();
  return getBackgroundLocationState();
}

export async function startBackgroundLocation(incidentId: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = await Location.getBackgroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) return false;

  await AsyncStorage.setItem(ACTIVE_INCIDENT_KEY, incidentId);
  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
  if (!running) {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10_000,
      distanceInterval: 15,
      deferredUpdatesInterval: 15_000,
      deferredUpdatesDistance: 20,
      foregroundService: {
        notificationTitle: 'Core Alert live location',
        notificationBody: 'Sharing your location with assigned guardians during an active SOS.',
        notificationColor: '#D92D20',
        killServiceOnDestroy: false,
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
  }
  return true;
}

export async function stopBackgroundLocation(): Promise<void> {
  if (Platform.OS === 'android') {
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
  await AsyncStorage.multiRemove([ACTIVE_INCIDENT_KEY, BACKGROUND_STATE_KEY]);
}
