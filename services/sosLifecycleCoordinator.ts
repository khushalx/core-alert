import type { SOSActivationSource } from '@/types';

export type SosLifecycleStage =
  | 'idle'
  | 'countdown'
  | 'activating'
  | 'active'
  | 'ending'
  | 'resolved'
  | 'activation_failed'
  | 'ending_failed';

export type SosLifecycleSnapshot = {
  stage: SosLifecycleStage;
  activationId: string | null;
  incidentId: string | null;
  source: SOSActivationSource | null;
};

const idleSnapshot = (): SosLifecycleSnapshot => ({
  stage: 'idle',
  activationId: null,
  incidentId: null,
  source: null,
});

/**
 * Synchronous transition gate for every JavaScript SOS entry point. Android
 * mirrors each accepted transition in its persisted native coordinator.
 */
export class SosLifecycleCoordinator {
  private snapshot = idleSnapshot();

  get current(): SosLifecycleSnapshot {
    return this.snapshot;
  }

  beginCountdown(activationId: string, source: SOSActivationSource): boolean {
    if (this.snapshot.stage !== 'idle') return false;
    this.snapshot = { stage: 'countdown', activationId, incidentId: null, source };
    return true;
  }

  claimActivation(activationId: string): boolean {
    if (this.snapshot.stage !== 'countdown' || this.snapshot.activationId !== activationId) return false;
    this.snapshot = { ...this.snapshot, stage: 'activating' };
    return true;
  }

  activated(activationId: string, incidentId: string): boolean {
    if (this.snapshot.stage !== 'activating' || this.snapshot.activationId !== activationId) return false;
    this.snapshot = { ...this.snapshot, stage: 'active', incidentId };
    return true;
  }

  activationFailed(activationId: string): boolean {
    if (this.snapshot.stage !== 'activating' || this.snapshot.activationId !== activationId) return false;
    this.snapshot = { ...this.snapshot, stage: 'activation_failed' };
    return true;
  }

  cancelCountdown(activationId: string): boolean {
    if (this.snapshot.stage !== 'countdown' || this.snapshot.activationId !== activationId) return false;
    this.snapshot = idleSnapshot();
    return true;
  }

  restoreActive(incidentId: string, source: SOSActivationSource): void {
    this.snapshot = { stage: 'active', activationId: null, incidentId, source };
  }

  beginEnding(incidentId: string): boolean {
    if (
      !['active', 'ending_failed'].includes(this.snapshot.stage) ||
      this.snapshot.incidentId !== incidentId
    ) return false;
    this.snapshot = { ...this.snapshot, stage: 'ending' };
    return true;
  }

  endingFailed(incidentId: string): boolean {
    if (this.snapshot.stage !== 'ending' || this.snapshot.incidentId !== incidentId) return false;
    this.snapshot = { ...this.snapshot, stage: 'ending_failed' };
    return true;
  }

  resolved(incidentId: string): boolean {
    if (
      !['ending', 'active'].includes(this.snapshot.stage) ||
      this.snapshot.incidentId !== incidentId
    ) return false;
    this.snapshot = { ...this.snapshot, stage: 'resolved' };
    return true;
  }

  reset(): boolean {
    if (!['resolved', 'activation_failed', 'idle'].includes(this.snapshot.stage)) return false;
    this.snapshot = idleSnapshot();
    return true;
  }

  forceIdle(): void {
    this.snapshot = idleSnapshot();
  }
}

export function createActivationId(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  let seed = Date.now();
  return template.replace(/[xy]/g, (character) => {
    const random = (seed + Math.random() * 16) % 16 | 0;
    seed = Math.floor(seed / 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export const sosLifecycleCoordinator = new SosLifecycleCoordinator();
