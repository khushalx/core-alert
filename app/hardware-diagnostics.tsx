import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useHardwareTrigger } from '@/hooks/useHardwareTrigger';
import { hardwareTriggerService } from '@/services/hardwareTriggerService';
import { useApp } from '@/store/AppContext';
import { hardwareStatusLabel, hardwareStatusTone } from '@/utils/hardwareTrigger';

export default function HardwareDiagnosticsScreen() {
  const { state } = useApp();
  const hardware = useHardwareTrigger();

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
          <DiagnosticRow label="Native module" value={hardware.nativeModuleAvailable ? 'Available' : 'Unavailable'} />
          <DiagnosticRow label="Listener attached" value={hardware.isListening ? 'Yes' : 'No'} />
          <DiagnosticRow label="Shortcut enabled" value={state.preferences.hardwareShortcutEnabled ? 'Yes' : 'No'} />
          <DiagnosticRow label="Current press count" value={`${hardware.pressCount}`} />
          <DiagnosticRow label="First press" value={formatTimestamp(hardware.firstPressAt)} />
          <DiagnosticRow label="Last press" value={formatTimestamp(hardware.lastPressAt)} />
          <DiagnosticRow label="Last native event" value={formatEvent(hardware.lastNativeEvent)} />
          <DiagnosticRow label="Last sequence result" value={hardware.lastSequenceResult} />
          <DiagnosticRow label="Development build" value={hardware.nativeModuleAvailable ? 'Detected' : 'Not detected'} last />
        </Card>

        <View style={styles.actions}>
          <Button label="Emit simulated native press" icon="volume-low-outline" onPress={() => hardwareTriggerService.emitSimulatedPress()} />
          <View style={styles.actionRow}>
            <Button label="Reset sequence" variant="secondary" onPress={() => hardwareTriggerService.reset('Manual diagnostic reset', true)} style={styles.flexButton} />
            <Button label="Attach listener" variant="secondary" onPress={() => hardwareTriggerService.verifyAndAttach()} style={styles.flexButton} />
          </View>
          <View style={styles.actionRow}>
            <Button label="Detach listener" variant="secondary" onPress={() => hardwareTriggerService.detach('Manual diagnostic detach')} style={styles.flexButton} />
            <Button label="Clear log" variant="secondary" onPress={() => hardwareTriggerService.clearLog()} style={styles.flexButton} />
          </View>
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

function formatEvent(event: ReturnType<typeof hardwareTriggerService.getSnapshot>['lastNativeEvent']): string {
  if (!event) return '—';
  return `${event.simulated ? 'simulated' : 'native'} • key ${event.keyCode} • repeat ${event.repeatCount}`;
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
  actionRow: { flexDirection: 'row', gap: 9 },
  flexButton: { flex: 1, paddingHorizontal: 8 },
  logTitle: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  logCard: { gap: 8 },
  logEntry: { color: colors.textSecondary, fontSize: 10, lineHeight: 15, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  emptyLog: { color: colors.textMuted, fontSize: 12 },
});
