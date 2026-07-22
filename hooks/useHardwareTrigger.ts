import { useSyncExternalStore } from 'react';

import { hardwareTriggerService } from '@/services/hardwareTriggerService';

export function useHardwareTrigger() {
  return useSyncExternalStore(
    hardwareTriggerService.subscribe,
    hardwareTriggerService.getSnapshot,
    hardwareTriggerService.getSnapshot,
  );
}
