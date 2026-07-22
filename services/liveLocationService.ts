import * as Location from 'expo-location';

import { shouldPersistLocation, type IncidentPoint } from '@/services/incidentService';

export type LiveLocationCallbacks = {
  onLocation: (point: IncidentPoint) => Promise<void>;
  onError: (message: string) => void;
};

export class LiveLocationService {
  private subscription: Location.LocationSubscription | null = null;
  private previous: IncidentPoint | null = null;
  private previousAt: number | null = null;

  get active(): boolean { return this.subscription !== null; }

  async start(callbacks: LiveLocationCallbacks): Promise<void> {
    await this.stop();
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      throw new Error('Location permission is required for live sharing.');
    }
    this.subscription = await Location.watchPositionAsync({
      accuracy: Location.Accuracy.High,
      timeInterval: 7_000,
      distanceInterval: 10,
    }, (position) => {
      const point: IncidentPoint = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        recordedAt: new Date(position.timestamp).toISOString(),
      };
      const now = position.timestamp;
      if (!shouldPersistLocation(this.previous, point, this.previousAt, now)) return;
      this.previous = point;
      this.previousAt = now;
      void callbacks.onLocation(point).catch(() => callbacks.onError('Live location will retry when the connection returns.'));
    });
  }

  async stop(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    this.previous = null;
    this.previousAt = null;
  }
}

export const liveLocationService = new LiveLocationService();
