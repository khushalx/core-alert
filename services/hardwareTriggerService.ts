import { Platform } from 'react-native';

import {
  createHardwareTriggerAdapter,
  hasNativeHardwareModule,
  type HardwareButtonEvent,
  type HardwareModuleType,
  type HardwareTriggerAdapter,
  type NativeHardwareDiagnostics,
  setNativePracticeMode,
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
  nativeModuleType: HardwareModuleType;
  nativeDiagnostics: NativeHardwareDiagnostics;
  shortcutEnabled: boolean;
  sosBusy: boolean;
  practiceMode: boolean;
  lastNativeEvent: HardwareButtonEvent | null;
  lastJavaScriptEventAt: number | null;
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
  onActivate: (source: SOSActivationSource) => boolean | void | Promise<boolean | void>;
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
  private lastNativeSequenceNumber: number | null = null;
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
      nativeModuleType: this.adapter.moduleType,
      nativeDiagnostics: {
        moduleLoaded: false,
        listening: false,
        eventBusSubscriberCount: 0,
        lastPhysicalEventTimestamp: null,
        lastPhysicalKeyCode: null,
        totalPhysicalPressesReceived: 0,
        lastModuleEmitTimestamp: null,
        totalEventsEmitted: 0,
        accessibilityEnabled: false,
        accessibilityConnected: false,
        activityForeground: false,
        protectionEnabled: false,
        cloudConfigured: false,
        configuredUserId: '',
        installationId: '',
        nativePressCount: 0,
        lastNativePressTimestamp: null,
        nativeCountdownActive: false,
        pendingNativeActivationId: null,
        pendingNativeActivationSource: null,
        pendingNativeActivationCreatedAt: null,
        pendingNativeActivationConsumedAt: null,
        pendingNativeActivationStatus: '',
        nativeLifecycleState: 'idle',
        lastNativeLifecycleState: '',
        nativeLifecycleUpdatedAt: null,
        lastNativeActivationTimestamp: null,
        lastNativeError: '',
        activeNativeIncidentId: null,
        nativeSosBusy: false,
        evidenceStatus: 'unavailable',
        evidenceMode: null,
        evidenceLastError: '',
        evidencePendingUploads: 0,
        cameraPermissionGranted: false,
        microphonePermissionGranted: false,
      },
      shortcutEnabled: true,
      sosBusy: false,
      practiceMode: false,
      lastNativeEvent: null,
      lastJavaScriptEventAt: null,
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
      sosBusy: this.context.sosBusy,
      practiceMode: this.context.practiceMode,
    });
    if (previous.practiceMode !== this.context.practiceMode) {
      void setNativePracticeMode(this.context.practiceMode);
    }

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
      await this.refreshNativeDiagnostics();
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
      await this.refreshNativeDiagnostics();
    }
  }

  handleNativeEvent = (event: HardwareButtonEvent): void => {
    this.update({ lastNativeEvent: event, lastJavaScriptEventAt: Date.now() });
    this.log(`${event.simulated ? 'Simulated' : 'Native'} key ${event.keyCode}, ${event.action}, repeat ${event.repeatCount}`);
    if (!event.simulated) void this.refreshNativeDiagnostics();

    if (!event.simulated && typeof event.nativeSequenceNumber === 'number') {
      if (
        this.lastNativeSequenceNumber !== null &&
        event.nativeSequenceNumber <= this.lastNativeSequenceNumber
      ) {
        this.result('JavaScript rejected a duplicate native sequence number');
        return;
      }
      this.lastNativeSequenceNumber = event.nativeSequenceNumber;
    }

    if (event.handledByNativeProtection) {
      const pressCount = event.nativePressCount ?? 0;
      this.update({
        pressCount,
        firstPressAt: null,
        lastPressAt: event.timestamp,
      });
      this.callbacks.onPress?.(pressCount);
      if (this.context.practiceMode && pressCount === this.threshold) {
        this.callbacks.onPracticeComplete?.();
        this.reset('Shortcut detected successfully');
        return;
      }
      this.result(
        pressCount === this.threshold
          ? 'Native protection started the SOS countdown'
          : `Native protection detected ${pressCount} of ${this.threshold} presses`,
      );
      return;
    }

    if (!event.simulated) {
      this.result('Ignored physical event not claimed by the native sequence manager');
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

    const simulatedSource: SOSActivationSource = 'developer-simulation';
    if (this.context.practiceMode) {
      this.callbacks.onPracticeComplete?.();
      this.reset('Shortcut detected successfully');
      return;
    }

    this.activationLocked = true;
    this.clearTimer();
    this.update({ pressCount: 0, firstPressAt: null, lastPressAt: null });
    this.result('Five presses completed; requesting SOS countdown');
    void Promise.resolve(this.callbacks.onActivate(simulatedSource))
      .then((activated) => {
        if (activated === false) {
          this.activationLocked = false;
          this.result('Five presses completed but SOS activation failed');
          return;
        }
        this.result('Five presses completed; SOS countdown started');
      })
      .catch(() => {
        this.activationLocked = false;
        this.result('Five presses completed but SOS activation failed');
      });
  };

  emitSimulatedPress(overrides: Partial<HardwareButtonEvent> = {}): void {
    this.handleNativeEvent({
      timestamp: Date.now(),
      keyCode: VOLUME_DOWN_KEY_CODE,
      action: 'down',
      repeatCount: 0,
      isRepeat: false,
      nativeSequenceNumber: undefined,
      simulated: true,
      ...overrides,
    });
  }

  async refreshNativeDiagnostics(): Promise<void> {
    try {
      const nativeDiagnostics = await this.adapter.getDiagnostics();
      this.update({
        nativeDiagnostics,
        nativeModuleAvailable: nativeDiagnostics.moduleLoaded || this.state.nativeModuleAvailable,
      });
    } catch (error) {
      this.log(`Native diagnostics unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async reattach(): Promise<void> {
    await this.detach('Diagnostic listener detached for reattach');
    await this.verifyAndAttach();
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
    if (__DEV__) console.log(`[CoreAlertVolume] ${message}`);
    this.update({ log: [entry, ...this.state.log].slice(0, 30) });
  }

  private update(patch: Partial<HardwareTriggerState>): void {
    this.state = { ...this.state, ...patch };
    this.subscribers.forEach((subscriber) => subscriber(this.state));
  }
}

export const hardwareTriggerService = new HardwareTriggerService();
