import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect } from 'react';

import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useHardwareTrigger } from '@/hooks/useHardwareTrigger';
import { hardwareTriggerService } from '@/services/hardwareTriggerService';
import { useApp } from '@/store/AppContext';
import { hardwareStatusLabel, hardwareStatusTone } from '@/utils/hardwareTrigger';

export default function HardwareDiagnosticsScreen() {
  const { state } = useApp();
  const hardware = useHardwareTrigger();
  const pipelineStatus = describePipeline(hardware);

  useEffect(() => {
    void hardwareTriggerService.refreshNativeDiagnostics();
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>DEVELOPER TOOL</Text><Text style={styles.title}>Shortcut diagnostics</Text></View>
          <StatusBadge label={hardwareStatusLabel(hardware.status)} tone={hardwareStatusTone(hardware.status)} />
        </View>

        <Card style={styles.card}>
          <DiagnosticRow label="Platform" value={Platform.OS} />
          <DiagnosticRow label="App state" value={hardware.appState} />
          <DiagnosticRow label="Native module available" value={hardware.nativeModuleAvailable ? 'Yes' : 'No'} />
          <DiagnosticRow label="Native module type" value={hardware.nativeModuleType === 'expo-module' ? 'Expo Module' : 'Fallback'} />
          <DiagnosticRow label="Listener attached" value={hardware.isListening ? 'Yes' : 'No'} />
          <DiagnosticRow label="Event bus subscribers" value={`${hardware.nativeDiagnostics.eventBusSubscriberCount}`} />
          <DiagnosticRow label="Shortcut enabled" value={state.preferences.hardwareShortcutEnabled ? 'Yes' : 'No'} />
          <DiagnosticRow label="Accessibility enabled" value={hardware.nativeDiagnostics.accessibilityEnabled ? 'Yes' : 'No'} />
          <DiagnosticRow label="Accessibility connected" value={hardware.nativeDiagnostics.accessibilityConnected ? 'Yes' : 'No'} />
          <DiagnosticRow label="Native protection enabled" value={hardware.nativeDiagnostics.protectionEnabled ? 'Yes' : 'No'} />
          <DiagnosticRow label="Native cloud configured" value={hardware.nativeDiagnostics.cloudConfigured ? 'Yes' : 'No'} />
          <DiagnosticRow label="Native press count" value={`${hardware.nativeDiagnostics.nativePressCount}`} />
          <DiagnosticRow label="Native countdown" value={hardware.nativeDiagnostics.nativeCountdownActive ? 'Active' : 'Idle'} />
          <DiagnosticRow label="Native SOS guard" value={hardware.nativeDiagnostics.nativeSosBusy ? 'Busy' : 'Idle'} />
          <DiagnosticRow label="Last native activation" value={formatTimestamp(hardware.nativeDiagnostics.lastNativeActivationTimestamp)} />
          <DiagnosticRow label="Native incident" value={hardware.nativeDiagnostics.activeNativeIncidentId ?? '—'} />
          <DiagnosticRow label="Native error" value={hardware.nativeDiagnostics.lastNativeError || '—'} />
          <DiagnosticRow label="Evidence status" value={hardware.nativeDiagnostics.evidenceStatus} />
          <DiagnosticRow label="Evidence mode" value={hardware.nativeDiagnostics.evidenceMode ?? '—'} />
          <DiagnosticRow label="Camera permission" value={hardware.nativeDiagnostics.cameraPermissionGranted ? 'Granted' : 'Required'} />
          <DiagnosticRow label="Microphone permission" value={hardware.nativeDiagnostics.microphonePermissionGranted ? 'Granted' : 'Required'} />
          <DiagnosticRow label="Evidence uploads" value={`${hardware.nativeDiagnostics.evidencePendingUploads} pending`} />
          <DiagnosticRow label="Evidence error" value={hardware.nativeDiagnostics.evidenceLastError || '—'} />
          <DiagnosticRow label="SOS busy" value={hardware.sosBusy ? 'Yes' : 'No'} />
          <DiagnosticRow label="Current press count" value={`${hardware.pressCount}`} />
          <DiagnosticRow label="First press" value={formatTimestamp(hardware.firstPressAt)} />
          <DiagnosticRow label="Last press" value={formatTimestamp(hardware.lastPressAt)} />
          <DiagnosticRow label="Last physical event" value={formatPhysicalEvent(hardware)} />
          <DiagnosticRow label="Total physical events" value={`${hardware.nativeDiagnostics.totalPhysicalPressesReceived}`} />
          <DiagnosticRow label="Last module emission" value={formatTimestamp(hardware.nativeDiagnostics.lastModuleEmitTimestamp)} />
          <DiagnosticRow label="Total module emissions" value={`${hardware.nativeDiagnostics.totalEventsEmitted}`} />
          <DiagnosticRow label="Last JavaScript event" value={formatJavaScriptEvent(hardware)} />
          <DiagnosticRow label="Last sequence result" value={hardware.lastSequenceResult} />
          <DiagnosticRow label="Development build" value={hardware.nativeModuleAvailable ? 'Detected' : 'Not detected'} last />
        </Card>

        <View style={styles.pipeline}>
          <Text style={styles.pipelineTitle}>PIPELINE RESULT</Text>
          <Text style={styles.pipelineText}>{pipelineStatus}</Text>
        </View>

        <View style={styles.actions}>
          <Button label="Emit simulated JavaScript press" icon="volume-low-outline" onPress={() => hardwareTriggerService.emitSimulatedPress()} />
          <View style={styles.actionRow}>
            <Button label="Reset sequence" variant="secondary" onPress={() => hardwareTriggerService.reset('Manual diagnostic reset', true)} style={styles.flexButton} />
            <Button label="Reattach listener" variant="secondary" onPress={() => void hardwareTriggerService.reattach()} style={styles.flexButton} />
          </View>
          <View style={styles.actionRow}>
            <Button label="Detach listener" variant="secondary" onPress={() => void hardwareTriggerService.detach('Manual diagnostic detach')} style={styles.flexButton} />
            <Button label="Refresh native diagnostics" variant="secondary" onPress={() => void hardwareTriggerService.refreshNativeDiagnostics()} style={styles.flexButton} />
          </View>
          <Button label="Clear log" variant="secondary" onPress={() => hardwareTriggerService.clearLog()} />
        </View>

        <View>
          <Text style={styles.logTitle}>LATEST EVENTS ({hardware.log.length}/30)</Text>
          <Card style={styles.logCard}>
            {hardware.log.length ? hardware.log.map((entry, index) => <Text key={`${entry}-${index}`} style={styles.logEntry}>{entry}</Text>) : <Text style={styles.emptyLog}>No diagnostic events yet.</Text>}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DiagnosticRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.row, !last && styles.rowBorder]}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function formatTimestamp(value: number | null): string {
  return value ? new Date(value).toLocaleTimeString() : '—';
}

type HardwareSnapshot = ReturnType<typeof hardwareTriggerService.getSnapshot>;

function formatPhysicalEvent(hardware: HardwareSnapshot): string {
  const timestamp = hardware.nativeDiagnostics.lastPhysicalEventTimestamp;
  if (!timestamp) return '—';
  return `${formatTimestamp(timestamp)} • key ${hardware.nativeDiagnostics.lastPhysicalKeyCode ?? '—'}`;
}

function formatJavaScriptEvent(hardware: HardwareSnapshot): string {
  if (!hardware.lastJavaScriptEventAt || !hardware.lastNativeEvent) return '—';
  const event = hardware.lastNativeEvent;
  return `${formatTimestamp(hardware.lastJavaScriptEventAt)} • ${event.simulated ? 'simulated' : `sequence ${event.nativeSequenceNumber ?? '—'}`}`;
}

function describePipeline(hardware: HardwareSnapshot): string {
  const native = hardware.nativeDiagnostics;
  if (!hardware.nativeModuleAvailable) return 'Native Expo Module is unavailable. The safe fallback is active.';
  if (native.totalPhysicalPressesReceived === 0) return 'Android has not captured a physical volume-down press yet.';
  if (
    native.totalEventsEmitted === 0 ||
    (native.lastPhysicalEventTimestamp ?? 0) > (native.lastModuleEmitTimestamp ?? 0)
  ) return 'Android captured the physical key, but the native module did not emit its latest event.';
  if (
    !hardware.lastJavaScriptEventAt ||
    hardware.lastJavaScriptEventAt < (native.lastModuleEmitTimestamp ?? 0)
  ) return 'The native module emitted the event, but JavaScript did not receive it.';
  if (hardware.lastSequenceResult.includes('activation failed')) {
    return 'Five presses completed, but the existing SOS countdown rejected activation.';
  }
  if (
    hardware.lastSequenceResult.startsWith('Ignored') ||
    hardware.lastSequenceResult.startsWith('JavaScript rejected')
  ) return `JavaScript received the event but rejected it: ${hardware.lastSequenceResult}`;
  if (hardware.lastSequenceResult.includes('countdown started')) {
    return 'Complete: Android captured the keys, JavaScript received them, and the SOS countdown started.';
  }
  return `JavaScript received the event. Sequence state: ${hardware.lastSequenceResult}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: 18, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 3 },
  card: { paddingVertical: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingVertical: 11 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { color: colors.textSecondary, fontSize: 12 },
  value: { color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'right', flex: 1 },
  actions: { gap: 9 },
  pipeline: { padding: 14, borderRadius: 12, backgroundColor: colors.blueSoft, borderWidth: 1, borderColor: colors.border },
  pipelineTitle: { color: colors.navy, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  pipelineText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 9 },
  flexButton: { flex: 1, paddingHorizontal: 8 },
  logTitle: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  logCard: { gap: 8 },
  logEntry: { color: colors.textSecondary, fontSize: 10, lineHeight: 15, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  emptyLog: { color: colors.textMuted, fontSize: 12 },
});
