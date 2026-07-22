import { Platform } from 'react-native';

import {
  createHardwareTriggerAdapter,
  hasNativeHardwareModule,
  type HardwareButtonEvent,
  type HardwareTriggerAdapter,
  VOLUME_DOWN_KEY_CODE,
} from '@/services/hardwareTriggerAdapter';
import type { SOSActivationSource } from '@/types';

export type HardwareTriggerStatus =
  | 'ready'
  | 'disabled'
  | 'unsupported'
  | 'development-build-required'
  | 'background'
  | 'error';

export type HardwareTriggerState = {
  pressCount: number;
  firstPressAt: number | null;
  lastPressAt: number | null;
  isListening: boolean;
  isSupported: boolean;
  status: HardwareTriggerStatus;
  appState: 'active' | 'background' | 'inactive' | 'unknown';
  nativeModuleAvailable: boolean;
  shortcutEnabled: boolean;
  practiceMode: boolean;
  lastNativeEvent: HardwareButtonEvent | null;
  lastSequenceResult: string;
  log: string[];
};

export type HardwareTriggerContext = {
  enabled: boolean;
  foreground: boolean;
  sosBusy: boolean;
  practiceMode: boolean;
};

export type HardwareTriggerCallbacks = {
  onActivate: (source: SOSActivationSource) => void | Promise<void>;
  onPress?: (pressCount: number) => void;
  onPracticeComplete?: () => void;
};

type Timer = ReturnType<typeof setTimeout>;

export class HardwareTriggerService {
  readonly threshold: number;
  readonly windowMs: number;

  private adapter: HardwareTriggerAdapter;
  private callbacks: HardwareTriggerCallbacks;
  private context: HardwareTriggerContext;
  private timeout: Timer | null = null;
  private activationLocked = false;
  private subscribers = new Set<(state: HardwareTriggerState) => void>();
  private state: HardwareTriggerState;

  constructor({
    adapter = createHardwareTriggerAdapter(),
    threshold = 5,
    windowMs = 3000,
    callbacks = { onActivate: () => undefined },
  }: {
    adapter?: HardwareTriggerAdapter;
    threshold?: number;
    windowMs?: number;
    callbacks?: HardwareTriggerCallbacks;
  } = {}) {
    this.adapter = adapter;
    this.threshold = threshold;
    this.windowMs = windowMs;
    this.callbacks = callbacks;
    this.context = { enabled: true, foreground: true, sosBusy: false, practiceMode: false };
    const nativeModuleAvailable = hasNativeHardwareModule();
    this.state = {
      pressCount: 0,
      firstPressAt: null,
      lastPressAt: null,
      isListening: false,
      isSupported: false,
      status: Platform.OS === 'android' ? 'development-build-required' : 'unsupported',
      appState: 'unknown',
      nativeModuleAvailable,
      shortcutEnabled: true,
      practiceMode: false,
      lastNativeEvent: null,
      lastSequenceResult: 'Not started',
      log: [],
    };
  }

  getSnapshot = (): HardwareTriggerState => this.state;

  subscribe = (subscriber: (state: HardwareTriggerState) => void): (() => void) => {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  };

  configure(callbacks: HardwareTriggerCallbacks): void {
    this.callbacks = callbacks;
  }

  setContext(next: Partial<HardwareTriggerContext>): void {
    const previous = this.context;
    this.context = { ...this.context, ...next };
    this.update({
      shortcutEnabled: this.context.enabled,
      practiceMode: this.context.practiceMode,
    });

    if (!this.context.enabled || !this.context.foreground || this.context.sosBusy) {
      this.reset(
        !this.context.enabled ? 'Shortcut disabled' : !this.context.foreground ? 'App moved to background' : 'SOS already active',
      );
    }
    if (previous.sosBusy && !this.context.sosBusy) this.activationLocked = false;
  }

  setAppState(appState: HardwareTriggerState['appState']): void {
    this.setContext({ foreground: appState === 'active' });
    this.update({ appState });
  }

  async verifyAndAttach(): Promise<void> {
    if (!this.context.enabled) {
      await this.detach('Shortcut disabled');
      this.update({ status: 'disabled' });
      return;
    }
    if (!this.context.foreground) {
      await this.detach('App is not in the foreground');
      this.update({ status: 'background' });
      return;
    }
    if (Platform.OS !== 'android') {
      await this.detach('Android only');
      this.update({ status: 'unsupported', isSupported: false });
      return;
    }
    if (!this.state.nativeModuleAvailable) {
      this.update({ status: 'development-build-required', isSupported: false, isListening: false });
      this.log('Native module unavailable; development build required');
      return;
    }

    try {
      const supported = await this.adapter.isSupported();
      if (!supported) {
        this.update({ status: 'unsupported', isSupported: false, isListening: false });
        return;
      }
      if (!this.state.isListening) {
        await this.adapter.startListening(this.handleNativeEvent);
        this.log('Foreground listener attached');
      }
      this.update({ status: 'ready', isSupported: true, isListening: true });
    } catch (error) {
      this.update({ status: 'error', isListening: false });
      this.log(`Listener error: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async detach(reason = 'Listener detached'): Promise<void> {
    try {
      await this.adapter.stopListening();
    } finally {
      this.update({ isListening: false });
      this.log(reason);
    }
  }

  handleNativeEvent = (event: HardwareButtonEvent): void => {
    const previousEvent = this.state.lastNativeEvent;
    this.update({ lastNativeEvent: event });
    this.log(`${event.simulated ? 'Simulated' : 'Native'} key ${event.keyCode}, ${event.action}, repeat ${event.repeatCount}`);

    if (
      previousEvent &&
      previousEvent.timestamp === event.timestamp &&
      previousEvent.keyCode === event.keyCode &&
      previousEvent.action === event.action
    ) {
      this.result('Ignored duplicate native event');
      return;
    }

    if (event.keyCode !== VOLUME_DOWN_KEY_CODE) {
      this.result('Ignored non-volume-down event');
      return;
    }
    if (event.action !== 'down' || event.repeatCount !== 0 || event.isRepeat) {
      this.result('Ignored repeat or non-initial press');
      return;
    }
    if (!this.context.enabled) {
      this.result('Ignored while shortcut disabled');
      return;
    }
    if (!this.context.foreground) {
      this.result('Ignored while app is in background');
      return;
    }
    if (this.context.sosBusy || this.activationLocked) {
      this.result('Ignored while SOS is already active');
      return;
    }

    const now = event.timestamp;
    const expired = this.state.firstPressAt !== null && now - this.state.firstPressAt >= this.windowMs;
    if (expired) this.reset('Sequence expired');

    const firstPressAt = this.state.firstPressAt ?? now;
    const pressCount = this.state.pressCount + 1;
    this.update({ pressCount, firstPressAt, lastPressAt: now });
    this.callbacks.onPress?.(pressCount);
    this.result(`${pressCount} of ${this.threshold} presses detected`);

    if (pressCount === 1) this.armTimeout();
    if (pressCount < this.threshold) return;

    const simulatedSource: SOSActivationSource = event.simulated
      ? 'developer-simulation'
      : 'volume-shortcut';
    if (this.context.practiceMode) {
      this.callbacks.onPracticeComplete?.();
      this.reset('Shortcut detected successfully');
      return;
    }

    this.activationLocked = true;
    this.clearTimer();
    this.update({ pressCount: 0, firstPressAt: null, lastPressAt: null });
    this.result('SOS countdown activated');
    void this.callbacks.onActivate(simulatedSource);
  };

  emitSimulatedPress(overrides: Partial<HardwareButtonEvent> = {}): void {
    this.handleNativeEvent({
      timestamp: Date.now(),
      keyCode: VOLUME_DOWN_KEY_CODE,
      action: 'down',
      repeatCount: 0,
      isRepeat: false,
      simulated: true,
      ...overrides,
    });
  }

  reset(reason = 'Sequence reset', releaseActivationLock = false): void {
    this.clearTimer();
    if (releaseActivationLock) this.activationLocked = false;
    this.update({ pressCount: 0, firstPressAt: null, lastPressAt: null });
    this.result(reason);
  }

  clearLog(): void {
    this.update({ log: [], lastSequenceResult: 'Log cleared', lastNativeEvent: null });
  }

  private armTimeout(): void {
    this.clearTimer();
    this.timeout = setTimeout(() => this.reset('Sequence reset after 3-second timeout'), this.windowMs);
  }

  private clearTimer(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private result(lastSequenceResult: string): void {
    this.update({ lastSequenceResult });
    this.log(lastSequenceResult);
  }

  private log(message: string): void {
    const entry = `${new Date().toISOString()}  ${message}`;
    this.update({ log: [entry, ...this.state.log].slice(0, 30) });
  }

  private update(patch: Partial<HardwareTriggerState>): void {
    this.state = { ...this.state, ...patch };
    this.subscribers.forEach((subscriber) => subscriber(this.state));
  }
}

export const hardwareTriggerService = new HardwareTriggerService();
