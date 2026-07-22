import type { SOSActivationSource } from '@/types';

export type EmergencyTriggerRequest = {
  source: SOSActivationSource;
  requestedAt: string;
};

export async function requestEmergencyTrigger(
  source: SOSActivationSource = 'manual-test',
): Promise<EmergencyTriggerRequest> {
  return { source, requestedAt: new Date().toISOString() };
}
