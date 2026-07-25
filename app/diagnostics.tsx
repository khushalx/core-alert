import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, LoadingState, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { getBackgroundLocationState, type BackgroundLocationState } from '@/services/backgroundLocationService';
import { hardwareTriggerService } from '@/services/hardwareTriggerService';
import { getNotificationPermissionState } from '@/services/notificationService';
import { offlineLocationQueue } from '@/services/offlineLocationQueue';
import { isSupabaseConfigured } from '@/services/supabase';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { useConnected } from '@/store/ConnectedContext';

type Snapshot = {
  network: string;
  background: BackgroundLocationState;
  notification: string;
  queueSize: number;
};

export default function DiagnosticsScreen() {
  const { state, location } = useApp();
  const { user } = useAuth();
  const { connection, pushTokenState, guardians, activeIncident } = useConnected();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [network, background, notification, queued] = await Promise.all([
        NetInfo.fetch(),
        getBackgroundLocationState(),
        getNotificationPermissionState(),
        offlineLocationQueue.read(),
      ]);
      setSnapshot({
        network: network.isConnected === false ? 'Offline' : network.isInternetReachable === false ? 'No internet' : 'Connected',
        background,
        notification,
        queueSize: queued.length,
      });
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Diagnostics could not be refreshed.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      NetInfo.fetch(),
      getBackgroundLocationState(),
      getNotificationPermissionState(),
      offlineLocationQueue.read(),
    ]).then(([network, background, notification, queued]) => {
      if (!active) return;
      setSnapshot({
        network: network.isConnected === false ? 'Offline' : network.isInternetReachable === false ? 'No internet' : 'Connected',
        background,
        notification,
        queueSize: queued.length,
      });
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Diagnostics could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  if (loading && !snapshot) return <SafeAreaView style={styles.screen}><LoadingState label="Checking Core Alert…" /></SafeAreaView>;

  const hardware = hardwareTriggerService.getSnapshot();
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><View style={styles.icon}><Ionicons name="pulse" size={24} color={colors.navy} /></View><View style={styles.headerCopy}><Text style={styles.title}>System diagnostics</Text><Text style={styles.subtitle}>Safe status only—no account IDs, tokens, medical information, or exact location.</Text></View></View>

        <DiagnosticCard title="Account and cloud">
          <DiagnosticRow label="Supabase environment" value={isSupabaseConfigured ? 'Configured' : 'Missing'} ready={isSupabaseConfigured} />
          <DiagnosticRow label="Authenticated session" value={user ? 'Active' : 'Signed out'} ready={Boolean(user)} />
          <DiagnosticRow label="Realtime" value={connection} ready={connection === 'connected'} />
          <DiagnosticRow label="Network" value={snapshot?.network ?? 'Unknown'} ready={snapshot?.network === 'Connected'} />
        </DiagnosticCard>

        <DiagnosticCard title="Emergency readiness">
          <DiagnosticRow label="Foreground location" value={location.permission} ready={location.permission === 'granted'} />
          <DiagnosticRow label="Background permission" value={snapshot?.background.permission ?? 'Unknown'} ready={snapshot?.background.permission === 'granted'} />
          <DiagnosticRow label="Background task" value={snapshot?.background.running ? 'Active incident service running' : 'Idle'} ready={!activeIncident || Boolean(snapshot?.background.running)} />
          <DiagnosticRow label="Notification permission" value={snapshot?.notification ?? 'Unknown'} ready={snapshot?.notification === 'granted'} />
          <DiagnosticRow label="Push registration" value={pushTokenState} ready={pushTokenState === 'registered'} />
          <DiagnosticRow label="Linked guardians" value={`${guardians.filter((item) => item.status === 'accepted').length} ready`} ready={guardians.some((item) => item.status === 'accepted')} />
          <DiagnosticRow label="Offline location queue" value={`${snapshot?.queueSize ?? 0} pending`} ready={(snapshot?.queueSize ?? 0) === 0} />
          <DiagnosticRow label="Evidence camera" value={hardware.nativeDiagnostics.cameraPermissionGranted ? 'Granted' : 'Permission required'} ready={hardware.nativeDiagnostics.cameraPermissionGranted} />
          <DiagnosticRow label="Evidence microphone" value={hardware.nativeDiagnostics.microphonePermissionGranted ? 'Granted' : 'Permission required'} ready={hardware.nativeDiagnostics.microphonePermissionGranted} />
          <DiagnosticRow label="Evidence capture" value={hardware.nativeDiagnostics.evidenceStatus} ready={!activeIncident || ['starting', 'recording', 'uploaded', 'idle'].includes(hardware.nativeDiagnostics.evidenceStatus)} />
          <DiagnosticRow label="Evidence uploads" value={`${hardware.nativeDiagnostics.evidencePendingUploads} pending`} ready={hardware.nativeDiagnostics.evidencePendingUploads === 0} />
        </DiagnosticCard>

        <DiagnosticCard title="Android shortcut">
          <DiagnosticRow label="Native bridge" value={hardware.nativeModuleAvailable ? 'Available' : 'Unavailable'} ready={hardware.nativeModuleAvailable} />
          <DiagnosticRow label="Listener" value={hardware.isListening ? 'Listening' : 'Idle'} ready={!state.preferences.hardwareShortcutEnabled || hardware.isListening} />
          <DiagnosticRow label="Current status" value={hardware.status} ready={hardware.status === 'ready'} />
        </DiagnosticCard>

        <DiagnosticCard title="Build">
          <DiagnosticRow label="App version" value={Constants.expoConfig?.version ?? 'Unknown'} ready />
          <DiagnosticRow label="Expo SDK" value={String(Constants.expoConfig?.sdkVersion ?? 57)} ready />
          <DiagnosticRow label="Physical device" value={Device.isDevice ? 'Yes' : 'Emulator / web'} ready={Device.isDevice} />
          <DiagnosticRow label="OS" value={`${Device.osName ?? 'Unknown'} ${Device.osVersion ?? ''}`.trim()} ready />
        </DiagnosticCard>

        {snapshot?.background.lastError ? <Text style={styles.warning}>{snapshot.background.lastError}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Refresh diagnostics" icon="refresh-outline" loading={loading} onPress={() => void refresh()} />
        <Button label="Open shortcut diagnostics" variant="secondary" icon="volume-low-outline" onPress={() => router.push('/hardware-diagnostics')} />
        <Text style={styles.disclaimer}>A green status means the check passed now. Android, network, provider, or battery conditions can still change later.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DiagnosticCard({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <Card><Text style={styles.cardTitle}>{title}</Text><View style={styles.rows}>{children}</View></Card>;
}
function DiagnosticRow({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><View style={styles.rowValue}><Text style={styles.value}>{value}</Text><StatusBadge label={ready ? 'OK' : 'Review'} tone={ready ? 'success' : 'warning'} /></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 14, paddingBottom: 34 },
  header: { flexDirection: 'row', alignItems: 'center' }, icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, marginLeft: 12 }, title: { color: colors.text, fontSize: 20, fontWeight: '800' }, subtitle: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 3 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, rows: { marginTop: 8 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, rowLabel: { color: colors.textSecondary, fontSize: 12, flex: 1 }, rowValue: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }, value: { color: colors.text, fontSize: 11, fontWeight: '700', textTransform: 'capitalize', textAlign: 'right', flexShrink: 1 }, warning: { color: colors.amber, backgroundColor: colors.amberSoft, borderRadius: 10, padding: 11, fontSize: 11, lineHeight: 17 }, error: { color: colors.redDark, backgroundColor: colors.redSoft, borderRadius: 10, padding: 11, fontSize: 11 }, disclaimer: { color: colors.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
});
