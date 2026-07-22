import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';

export const VOLUME_DOWN_KEY_CODE = 25;
export const HARDWARE_EVENT_NAME = 'coreAlertVolumeDownPress';

export type HardwareButtonEvent = {
  timestamp: number;
  keyCode: number;
  action: 'down' | 'up';
  repeatCount: number;
  isRepeat: boolean;
  simulated?: boolean;
};

export interface HardwareTriggerAdapter {
  isSupported(): Promise<boolean>;
  startListening(onVolumeDown: (event: HardwareButtonEvent) => void): Promise<void>;
  stopListening(): Promise<void>;
}

type NativeHardwareModule = {
  isSupported(): Promise<boolean>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const nativeModule = NativeModules.CoreAlertHardware as NativeHardwareModule | undefined;

export function hasNativeHardwareModule(): boolean {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

class AndroidHardwareTriggerAdapter implements HardwareTriggerAdapter {
  private subscription: EmitterSubscription | null = null;

  async isSupported(): Promise<boolean> {
    if (!nativeModule || Platform.OS !== 'android') return false;
    return nativeModule.isSupported();
  }

  async startListening(onVolumeDown: (event: HardwareButtonEvent) => void): Promise<void> {
    if (!nativeModule || Platform.OS !== 'android') return;
    this.subscription?.remove();
    this.subscription = new NativeEventEmitter(nativeModule).addListener(
      HARDWARE_EVENT_NAME,
      onVolumeDown,
    );
    await nativeModule.startListening();
  }

  async stopListening(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    if (nativeModule && Platform.OS === 'android') await nativeModule.stopListening();
  }
}

export class MockHardwareTriggerAdapter implements HardwareTriggerAdapter {
  private listener: ((event: HardwareButtonEvent) => void) | null = null;

  constructor(private readonly supported = false) {}

  async isSupported(): Promise<boolean> {
    return this.supported;
  }

  async startListening(onVolumeDown: (event: HardwareButtonEvent) => void): Promise<void> {
    this.listener = onVolumeDown;
  }

  async stopListening(): Promise<void> {
    this.listener = null;
  }

  emit(event: HardwareButtonEvent): void {
    this.listener?.(event);
  }
}

export function createHardwareTriggerAdapter(): HardwareTriggerAdapter {
  return hasNativeHardwareModule()
    ? new AndroidHardwareTriggerAdapter()
    : new MockHardwareTriggerAdapter(false);
}
