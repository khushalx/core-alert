import { SosLifecycleCoordinator, createActivationId } from '@/services/sosLifecycleCoordinator';

describe('SosLifecycleCoordinator', () => {
  it('allows each activation transition exactly once', () => {
    const coordinator = new SosLifecycleCoordinator();
    const activationId = createActivationId();
    expect(coordinator.beginCountdown(activationId, 'manual-test')).toBe(true);
    expect(coordinator.beginCountdown(createActivationId(), 'manual-test')).toBe(false);
    expect(coordinator.claimActivation(activationId)).toBe(true);
    expect(coordinator.claimActivation(activationId)).toBe(false);
    expect(coordinator.activated(activationId, 'incident-1')).toBe(true);
    expect(coordinator.activated(activationId, 'incident-2')).toBe(false);
  });

  it('locks ending, supports retry after failure, then resolves once', () => {
    const coordinator = new SosLifecycleCoordinator();
    coordinator.restoreActive('incident-1', 'volume-shortcut');
    expect(coordinator.beginEnding('incident-1')).toBe(true);
    expect(coordinator.beginEnding('incident-1')).toBe(false);
    expect(coordinator.endingFailed('incident-1')).toBe(true);
    expect(coordinator.beginEnding('incident-1')).toBe(true);
    expect(coordinator.resolved('incident-1')).toBe(true);
    expect(coordinator.resolved('incident-1')).toBe(false);
    expect(coordinator.reset()).toBe(true);
    expect(coordinator.current.stage).toBe('idle');
  });

  it('generates UUID-shaped activation identifiers', () => {
    expect(createActivationId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
