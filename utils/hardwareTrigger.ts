import type { HardwareTriggerStatus } from '@/services/hardwareTriggerService';

export function hardwareStatusLabel(status: HardwareTriggerStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'disabled':
      return 'Disabled';
    case 'development-build-required':
      return 'Development build required';
    case 'background':
      return 'Foreground only';
    case 'error':
      return 'Temporarily unavailable';
    case 'unsupported':
      return 'Android only';
  }
}

export function hardwareStatusTone(status: HardwareTriggerStatus) {
  if (status === 'ready') return 'success' as const;
  if (status === 'error' || status === 'development-build-required') return 'warning' as const;
  return 'neutral' as const;
}
