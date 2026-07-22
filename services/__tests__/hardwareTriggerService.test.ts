/// <reference types="jest" />

import { MockHardwareTriggerAdapter, type HardwareButtonEvent } from '@/services/hardwareTriggerAdapter';
import { HardwareTriggerService } from '@/services/hardwareTriggerService';

const services: HardwareTriggerService[] = [];

function event(timestamp: number, overrides: Partial<HardwareButtonEvent> = {}): HardwareButtonEvent {
  return {
    timestamp,
    keyCode: 25,
    action: 'down',
    repeatCount: 0,
    isRepeat: false,
    ...overrides,
  };
}

function createService(options: {
  onActivate?: jest.Mock;
  onPracticeComplete?: jest.Mock;
} = {}) {
  const onActivate = options.onActivate ?? jest.fn();
  const onPracticeComplete = options.onPracticeComplete ?? jest.fn();
  const service = new HardwareTriggerService({
    adapter: new MockHardwareTriggerAdapter(true),
    callbacks: { onActivate, onPracticeComplete },
  });
  service.setContext({ enabled: true, foreground: true, sosBusy: false, practiceMode: false });
  services.push(service);
  return { service, onActivate, onPracticeComplete };
}

function press(service: HardwareTriggerService, count: number, start = 1000, interval = 400) {
  for (let index = 0; index < count; index += 1) {
    service.handleNativeEvent(event(start + index * interval));
  }
}

describe('HardwareTriggerService five-press sequence', () => {
  beforeEach(() => jest.useFakeTimers());

  afterEach(() => {
    services.splice(0).forEach((service) => service.reset('Test cleanup', true));
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('activates after five valid presses within three seconds', () => {
    const { service, onActivate } = createService();
    press(service, 5);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith('volume-shortcut');
  });

  it('does not activate after only four presses', () => {
    const { service, onActivate } = createService();
    press(service, 4);
    expect(onActivate).not.toHaveBeenCalled();
    expect(service.getSnapshot().pressCount).toBe(4);
  });

  it('does not activate when the fifth press is outside the window', () => {
    const { service, onActivate } = createService();
    press(service, 4, 1000, 500);
    service.handleNativeEvent(event(4100));
    expect(onActivate).not.toHaveBeenCalled();
    expect(service.getSnapshot().pressCount).toBe(1);
  });

  it('ignores volume-up', () => {
    const { service, onActivate } = createService();
    service.handleNativeEvent(event(1000, { keyCode: 24 }));
    expect(onActivate).not.toHaveBeenCalled();
    expect(service.getSnapshot().pressCount).toBe(0);
  });

  it('ignores repeated long-press events', () => {
    const { service, onActivate } = createService();
    service.handleNativeEvent(event(1000, { repeatCount: 4, isRepeat: true }));
    expect(onActivate).not.toHaveBeenCalled();
    expect(service.getSnapshot().pressCount).toBe(0);
  });

  it('resets the sequence after timeout', () => {
    const { service } = createService();
    service.handleNativeEvent(event(1000));
    jest.advanceTimersByTime(3001);
    expect(service.getSnapshot().pressCount).toBe(0);
    expect(service.getSnapshot().firstPressAt).toBeNull();
  });

  it('resets after cancellation and permits a future sequence', () => {
    const { service, onActivate } = createService();
    press(service, 3);
    service.reset('Countdown cancelled', true);
    expect(service.getSnapshot().pressCount).toBe(0);
    press(service, 5, 5000);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('does not activate twice from additional presses', () => {
    const { service, onActivate } = createService();
    press(service, 5);
    press(service, 5, 5000);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('never activates SOS in practice mode', () => {
    const onPracticeComplete = jest.fn();
    const { service, onActivate } = createService({ onPracticeComplete });
    service.setContext({ practiceMode: true });
    press(service, 5);
    expect(onActivate).not.toHaveBeenCalled();
    expect(onPracticeComplete).toHaveBeenCalledTimes(1);
  });

  it('ignores every input while disabled', () => {
    const { service, onActivate } = createService();
    service.setContext({ enabled: false });
    press(service, 5);
    expect(onActivate).not.toHaveBeenCalled();
    expect(service.getSnapshot().pressCount).toBe(0);
  });

  it('resets an incomplete sequence on background transition', () => {
    const { service } = createService();
    press(service, 3);
    service.setAppState('background');
    expect(service.getSnapshot().pressCount).toBe(0);
  });

  it('blocks activation while an incident is already active', () => {
    const { service, onActivate } = createService();
    service.setContext({ sosBusy: true });
    press(service, 5);
    expect(onActivate).not.toHaveBeenCalled();
    expect(service.getSnapshot().pressCount).toBe(0);
  });
});
