import {
  NativeModule,
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';
import { Platform } from 'react-native';

export const VOLUME_DOWN_KEY_CODE = 25;
export const HARDWARE_EVENT_NAME = 'coreAlertVolumeDownPress';

export type HardwareButtonEvent = {
  timestamp: number;
  keyCode: number;
  action: 'down' | 'up';
  repeatCount: number;
  isRepeat: boolean;
  nativeSequenceNumber?: number;
  captureSource?: 'activity' | 'accessibility';
  handledByNativeProtection?: boolean;
  nativePressCount?: number;
  simulated?: boolean;
};

export type NativeHardwareDiagnostics = {
  moduleLoaded: boolean;
  listening: boolean;
  eventBusSubscriberCount: number;
  lastPhysicalEventTimestamp: number | null;
  lastPhysicalKeyCode: number | null;
  totalPhysicalPressesReceived: number;
  lastModuleEmitTimestamp: number | null;
  totalEventsEmitted: number;
  accessibilityEnabled: boolean;
  accessibilityConnected: boolean;
  activityForeground: boolean;
  protectionEnabled: boolean;
  cloudConfigured: boolean;
  configuredUserId: string;
  installationId: string;
  nativePressCount: number;
  lastNativePressTimestamp: number | null;
  nativeCountdownActive: boolean;
  pendingNativeActivationId: string | null;
  pendingNativeActivationSource: string | null;
  pendingNativeActivationCreatedAt: number | null;
  pendingNativeActivationConsumedAt: number | null;
  pendingNativeActivationStatus: string;
  nativeLifecycleState: string;
  lastNativeLifecycleState: string;
  nativeLifecycleUpdatedAt: number | null;
  lastNativeActivationTimestamp: number | null;
  lastNativeError: string;
  activeNativeIncidentId: string | null;
  nativeSosBusy: boolean;
  evidenceStatus: string;
  evidenceMode: string | null;
  evidenceLastError: string;
  evidencePendingUploads: number;
  cameraPermissionGranted: boolean;
  microphonePermissionGranted: boolean;
};

export type HardwareModuleType = 'expo-module' | 'fallback';

export interface HardwareTriggerAdapter {
  readonly moduleType: HardwareModuleType;
  isSupported(): Promise<boolean>;
  startListening(onVolumeDown: (event: HardwareButtonEvent) => void): Promise<void>;
  stopListening(): Promise<void>;
  getDiagnostics(): Promise<NativeHardwareDiagnostics>;
}

type CoreAlertHardwareEvents = {
  coreAlertVolumeDownPress: (event: HardwareButtonEvent) => void;
};

declare class CoreAlertHardwareNativeModule extends NativeModule<CoreAlertHardwareEvents> {
  isSupported(): boolean | Promise<boolean>;
  startListening(): void | Promise<void>;
  stopListening(): void | Promise<void>;
  getDiagnostics(): unknown | Promise<unknown>;
  getInstallationId(): string | Promise<string>;
  openAccessibilitySettings(): boolean | Promise<boolean>;
  configureProtection(options: NativeProtectionConfiguration): boolean | Promise<boolean>;
  updateProtectionPreferences(enabled: boolean, countdownSeconds: number, demoMode: boolean): boolean | Promise<boolean>;
  clearProtection(): boolean | Promise<boolean>;
  stopNativeLocation(): boolean | Promise<boolean>;
  setSosBusy(busy: boolean, incidentId: string | null): boolean | Promise<boolean>;
  clearNativeIncident(): boolean | Promise<boolean>;
  setPracticeMode(enabled: boolean): boolean | Promise<boolean>;
  beginSosCountdown(activationId: string, source: string): boolean | Promise<boolean>;
  claimSosActivation(activationId: string): boolean | Promise<boolean>;
  markSosActive(activationId: string, incidentId: string): boolean | Promise<boolean>;
  markSosActivationFailed(activationId: string, message: string): boolean | Promise<boolean>;
  cancelSosCountdown(activationId: string): boolean | Promise<boolean>;
  restoreSosActive(incidentId: string): boolean | Promise<boolean>;
  beginSosEnding(incidentId: string): boolean | Promise<boolean>;
  markSosEndingFailed(incidentId: string, message: string): boolean | Promise<boolean>;
  completeSosEnd(incidentId: string): boolean | Promise<boolean>;
  requestEvidencePermissions(): boolean | Promise<boolean>;
  startEvidenceCapture(incidentId: string, isDemo: boolean): boolean | Promise<boolean>;
  stopEvidenceCapture(): boolean | Promise<boolean>;
}

export type NativeProtectionConfiguration = {
  endpoint: string;
  anonKey: string;
  deviceId: string;
  deviceSecret: string;
  userId: string;
  countdownSeconds: number;
  demoMode: boolean;
};

function loadNativeModule(): CoreAlertHardwareNativeModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireOptionalNativeModule<CoreAlertHardwareNativeModule>('CoreAlertHardware');
  } catch {
    return null;
  }
}

const nativeModule = loadNativeModule();

const fallbackDiagnostics: NativeHardwareDiagnostics = {
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
};

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalTimestamp(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed > 0 ? parsed : null;
}

export function parseNativeHardwareDiagnostics(value: unknown): NativeHardwareDiagnostics {
  if (!value || typeof value !== 'object') return fallbackDiagnostics;
  const diagnostics = value as Record<string, unknown>;
  const lastKeyCode = finiteNumber(diagnostics.lastPhysicalKeyCode);
  return {
    moduleLoaded: diagnostics.moduleLoaded === true,
    listening: diagnostics.listening === true,
    eventBusSubscriberCount: Math.max(0, finiteNumber(diagnostics.eventBusSubscriberCount)),
    lastPhysicalEventTimestamp: optionalTimestamp(diagnostics.lastPhysicalEventTimestamp),
    lastPhysicalKeyCode: lastKeyCode > 0 ? lastKeyCode : null,
    totalPhysicalPressesReceived: Math.max(0, finiteNumber(diagnostics.totalPhysicalPressesReceived)),
    lastModuleEmitTimestamp: optionalTimestamp(diagnostics.lastModuleEmitTimestamp),
    totalEventsEmitted: Math.max(0, finiteNumber(diagnostics.totalEventsEmitted)),
    accessibilityEnabled: diagnostics.accessibilityEnabled === true,
    accessibilityConnected: diagnostics.accessibilityConnected === true,
    activityForeground: diagnostics.activityForeground === true,
    protectionEnabled: diagnostics.protectionEnabled === true,
    cloudConfigured: diagnostics.cloudConfigured === true,
    configuredUserId: typeof diagnostics.configuredUserId === 'string' ? diagnostics.configuredUserId : '',
    installationId: typeof diagnostics.installationId === 'string' ? diagnostics.installationId : '',
    nativePressCount: Math.max(0, finiteNumber(diagnostics.nativePressCount)),
    lastNativePressTimestamp: optionalTimestamp(diagnostics.lastNativePressTimestamp),
    nativeCountdownActive: diagnostics.nativeCountdownActive === true,
    pendingNativeActivationId:
      typeof diagnostics.pendingNativeActivationId === 'string' && diagnostics.pendingNativeActivationId
        ? diagnostics.pendingNativeActivationId
        : null,
    pendingNativeActivationSource:
      typeof diagnostics.pendingNativeActivationSource === 'string' && diagnostics.pendingNativeActivationSource
        ? diagnostics.pendingNativeActivationSource
        : null,
    pendingNativeActivationCreatedAt: optionalTimestamp(diagnostics.pendingNativeActivationCreatedAt),
    pendingNativeActivationConsumedAt: optionalTimestamp(diagnostics.pendingNativeActivationConsumedAt),
    pendingNativeActivationStatus: typeof diagnostics.pendingNativeActivationStatus === 'string'
      ? diagnostics.pendingNativeActivationStatus
      : '',
    nativeLifecycleState: typeof diagnostics.nativeLifecycleState === 'string'
      ? diagnostics.nativeLifecycleState
      : 'idle',
    lastNativeLifecycleState: typeof diagnostics.lastNativeLifecycleState === 'string'
      ? diagnostics.lastNativeLifecycleState
      : '',
    nativeLifecycleUpdatedAt: optionalTimestamp(diagnostics.nativeLifecycleUpdatedAt),
    lastNativeActivationTimestamp: optionalTimestamp(diagnostics.lastNativeActivationTimestamp),
    lastNativeError: typeof diagnostics.lastNativeError === 'string' ? diagnostics.lastNativeError : '',
    activeNativeIncidentId: typeof diagnostics.activeNativeIncidentId === 'string' && diagnostics.activeNativeIncidentId
      ? diagnostics.activeNativeIncidentId
      : null,
    nativeSosBusy: diagnostics.nativeSosBusy === true,
    evidenceStatus: typeof diagnostics.evidenceStatus === 'string'
      ? diagnostics.evidenceStatus
      : 'unavailable',
    evidenceMode: typeof diagnostics.evidenceMode === 'string' && diagnostics.evidenceMode
      ? diagnostics.evidenceMode
      : null,
    evidenceLastError: typeof diagnostics.evidenceLastError === 'string'
      ? diagnostics.evidenceLastError
      : '',
    evidencePendingUploads: Math.max(0, finiteNumber(diagnostics.evidencePendingUploads)),
    cameraPermissionGranted: diagnostics.cameraPermissionGranted === true,
    microphonePermissionGranted: diagnostics.microphonePermissionGranted === true,
  };
}

export function hasNativeHardwareModule(): boolean {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

export class AndroidHardwareTriggerAdapter implements HardwareTriggerAdapter {
  readonly moduleType = 'expo-module' as const;
  private subscription: EventSubscription | null = null;

  constructor(private readonly module: CoreAlertHardwareNativeModule) {}

  async isSupported(): Promise<boolean> {
    return Boolean(await this.module.isSupported());
  }

  async startListening(onVolumeDown: (event: HardwareButtonEvent) => void): Promise<void> {
    if (this.subscription) {
      await this.module.startListening();
      return;
    }
    const subscription = this.module.addListener(HARDWARE_EVENT_NAME, onVolumeDown);
    this.subscription = subscription;
    try {
      await this.module.startListening();
    } catch (error) {
      subscription.remove();
      this.subscription = null;
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    await this.module.stopListening();
  }

  async getDiagnostics(): Promise<NativeHardwareDiagnostics> {
    return parseNativeHardwareDiagnostics(await this.module.getDiagnostics());
  }
}

export class MockHardwareTriggerAdapter implements HardwareTriggerAdapter {
  readonly moduleType = 'fallback' as const;
  private listener: ((event: HardwareButtonEvent) => void) | null = null;
  attachCount = 0;
  stopCount = 0;

  constructor(private readonly supported = false) {}

  async isSupported(): Promise<boolean> {
    return this.supported;
  }

  async startListening(onVolumeDown: (event: HardwareButtonEvent) => void): Promise<void> {
    if (!this.listener) this.attachCount += 1;
    this.listener = onVolumeDown;
  }

  async stopListening(): Promise<void> {
    if (this.listener) this.stopCount += 1;
    this.listener = null;
  }

  async getDiagnostics(): Promise<NativeHardwareDiagnostics> {
    return { ...fallbackDiagnostics, listening: Boolean(this.listener) };
  }

  emit(event: HardwareButtonEvent): void {
    this.listener?.(event);
  }

  get isListening(): boolean {
    return Boolean(this.listener);
  }
}

export function createHardwareTriggerAdapter(): HardwareTriggerAdapter {
  return nativeModule
    ? new AndroidHardwareTriggerAdapter(nativeModule)
    : new MockHardwareTriggerAdapter(false);
}

export async function getNativeInstallationId(): Promise<string | null> {
  if (!nativeModule) return null;
  const value = await nativeModule.getInstallationId();
  return typeof value === 'string' && value ? value : null;
}

export async function openHardwareAccessibilitySettings(): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.openAccessibilitySettings()) : false;
}

export async function configureNativeProtection(options: NativeProtectionConfiguration): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.configureProtection(options)) : false;
}

export async function updateNativeProtectionPreferences(
  enabled: boolean,
  countdownSeconds: number,
  demoMode: boolean,
): Promise<boolean> {
  return nativeModule
    ? Boolean(await nativeModule.updateProtectionPreferences(enabled, countdownSeconds, demoMode))
    : false;
}

export async function clearNativeProtection(): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.clearProtection()) : false;
}

export async function stopNativeLocation(): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.stopNativeLocation()) : false;
}

export async function getNativeProtectionDiagnostics(): Promise<NativeHardwareDiagnostics> {
  return nativeModule
    ? parseNativeHardwareDiagnostics(await nativeModule.getDiagnostics())
    : fallbackDiagnostics;
}

export async function setNativeSosBusy(busy: boolean, incidentId: string | null): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.setSosBusy(busy, incidentId)) : false;
}

export async function clearNativeIncident(): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.clearNativeIncident()) : false;
}

export async function setNativePracticeMode(enabled: boolean): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.setPracticeMode(enabled)) : false;
}

export async function beginNativeSosCountdown(activationId: string, source: string): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.beginSosCountdown(activationId, source)) : true;
}

export async function claimNativeSosActivation(activationId: string): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.claimSosActivation(activationId)) : true;
}

export async function markNativeSosActive(activationId: string, incidentId: string): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.markSosActive(activationId, incidentId)) : true;
}

export async function markNativeSosActivationFailed(activationId: string, message: string): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.markSosActivationFailed(activationId, message)) : true;
}

export async function cancelNativeSosCountdown(activationId: string): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.cancelSosCountdown(activationId)) : true;
}

export async function restoreNativeSosActive(incidentId: string): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.restoreSosActive(incidentId)) : true;
}

export async function beginNativeSosEnding(incidentId: string): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.beginSosEnding(incidentId)) : true;
}

export async function markNativeSosEndingFailed(incidentId: string, message: string): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.markSosEndingFailed(incidentId, message)) : true;
}

export async function completeNativeSosEnd(incidentId: string): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.completeSosEnd(incidentId)) : true;
}

export async function requestNativeEvidencePermissions(): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.requestEvidencePermissions()) : false;
}

export async function startNativeEvidenceCapture(
  incidentId: string,
  isDemo: boolean,
): Promise<boolean> {
  return nativeModule
    ? Boolean(await nativeModule.startEvidenceCapture(incidentId, isDemo))
    : false;
}

export async function stopNativeEvidenceCapture(): Promise<boolean> {
  return nativeModule ? Boolean(await nativeModule.stopEvidenceCapture()) : false;
}
