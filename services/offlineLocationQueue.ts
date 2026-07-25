import AsyncStorage from '@react-native-async-storage/async-storage';

export type QueuedLocation = {
  incidentId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
};

export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const QUEUE_KEY = '@core-alert/offline-location-queue';
const MAX_QUEUE_SIZE = 100;

export class OfflineLocationQueue {
  constructor(private readonly storage: QueueStorage = AsyncStorage) {}

  async read(): Promise<QueuedLocation[]> {
    const raw = await this.storage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as QueuedLocation[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      await this.storage.setItem(QUEUE_KEY, '[]');
      return [];
    }
  }

  async enqueue(item: QueuedLocation): Promise<number> {
    const current = await this.read();
    const next = [...current, item].slice(-MAX_QUEUE_SIZE);
    await this.storage.setItem(QUEUE_KEY, JSON.stringify(next));
    return next.length;
  }

  async flush(sender: (item: QueuedLocation) => Promise<void>): Promise<{ sent: number; remaining: number }> {
    const current = await this.read();
    let sent = 0;
    for (let index = 0; index < current.length; index += 1) {
      try {
        await sender(current[index]);
        sent += 1;
      } catch {
        const remaining = current.slice(index);
        await this.storage.setItem(QUEUE_KEY, JSON.stringify(remaining));
        return { sent, remaining: remaining.length };
      }
    }
    await this.storage.setItem(QUEUE_KEY, '[]');
    return { sent, remaining: 0 };
  }

  async removeIncident(incidentId: string): Promise<number> {
    const current = await this.read();
    const next = current.filter((item) => item.incidentId !== incidentId);
    await this.storage.setItem(QUEUE_KEY, JSON.stringify(next));
    return current.length - next.length;
  }

  async flushIncident(
    incidentId: string,
    sender: (item: QueuedLocation) => Promise<void>,
  ): Promise<{ sent: number; remaining: number }> {
    const current = await this.read();
    const unrelated = current.filter((item) => item.incidentId !== incidentId);
    const matching = current.filter((item) => item.incidentId === incidentId);
    let sent = 0;
    for (let index = 0; index < matching.length; index += 1) {
      try {
        await sender(matching[index]);
        sent += 1;
      } catch {
        const remainingItems = [...unrelated, ...matching.slice(index)].slice(-MAX_QUEUE_SIZE);
        await this.storage.setItem(QUEUE_KEY, JSON.stringify(remainingItems));
        return { sent, remaining: matching.length - index };
      }
    }
    await this.storage.setItem(QUEUE_KEY, JSON.stringify(unrelated));
    return { sent, remaining: 0 };
  }
}

export const offlineLocationQueue = new OfflineLocationQueue();
