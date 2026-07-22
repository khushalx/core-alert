import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { AppHeader, Button, Card, Screen, StatusBadge } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useHardwareTrigger } from '@/hooks/useHardwareTrigger';
import { hardwareTriggerService } from '@/services/hardwareTriggerService';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { useConnected } from '@/store/ConnectedContext';
import { greeting } from '@/utils/format';
import { hardwareStatusLabel, hardwareStatusTone } from '@/utils/hardwareTrigger';

export default function HomeScreen() {
  const { state, location, startSosTest, showToast } = useApp();
  const { profile } = useAuth();
  const { guardians, incomingRequests, guardianAlert, connection } = useConnected();
  const hardware = useHardwareTrigger();
  const [detailsVisible, setDetailsVisible] = useState(false);
  const activeGuardians = guardians.filter((guardian) => guardian.status === 'accepted' && guardian.guardian_user_id).length;
  const locationReady = location.permission === 'granted';

  const runTest = async () => {
    const started = await startSosTest();
    if (!started) showToast('An SOS test is already running');
  };

  return (
    <Screen>
      <AppHeader subtitle={greeting()} title={profile?.full_name || state.profile.fullName || 'Core Alert user'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {guardianAlert ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/guardian-incident/[id]', params: { id: guardianAlert.incident.id } })} style={({ pressed }) => [styles.incomingCard, pressed && styles.pressed]}>
            <View style={styles.incomingIcon}><Ionicons name="alert-circle" size={25} color={colors.white} /></View>
            <View style={styles.incomingCopy}><Text style={styles.incomingEyebrow}>{guardianAlert.incident.is_demo ? 'DEMO SOS' : 'SOS ACTIVE'}</Text><Text style={styles.incomingTitle}>{guardianAlert.owner?.full_name ?? 'Protected user'} needs your response</Text></View>
            <Ionicons name="chevron-forward" size={20} color={colors.white} />
          </Pressable>
        ) : incomingRequests.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/guardian-requests')} style={({ pressed }) => [styles.requestNotice, pressed && styles.pressed]}><Ionicons name="person-add-outline" size={20} color={colors.navy} /><Text style={styles.requestNoticeText}>{incomingRequests.length} guardian request{incomingRequests.length === 1 ? '' : 's'} waiting</Text><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>
        ) : null}
        <Card style={styles.protectionCard}>
          <View style={styles.protectionRow}>
            <View style={styles.statusDot} />
            <View style={styles.protectionCopy}>
              <View style={styles.titleLine}>
                <Text style={styles.protectionTitle}>Protection active</Text>
                {state.preferences.demoModeEnabled ? <StatusBadge label="Demo mode" tone="neutral" /> : null}
              </View>
              <Text style={styles.protectionText}>{connection === 'connected' ? 'Account and realtime safety data are connected.' : 'Safety data is reconnecting.'}</Text>
            </View>
            <Ionicons name="shield-checkmark" size={27} color={colors.green} />
          </View>
          <View style={styles.indicatorRow}>
            <MiniStatus icon="people-outline" label={`${activeGuardians} guardians`} ready={activeGuardians > 0} />
            <MiniStatus icon="location-outline" label={locationReady ? 'Location on' : 'Location off'} ready={locationReady} />
          </View>
        </Card>

        <Card style={styles.shortcutCard}>
          <View style={styles.shortcutTop}>
            <Pressable accessibilityRole="button" onPress={() => setDetailsVisible(true)} hitSlop={8}>
              <StatusBadge label={hardwareStatusLabel(hardware.status)} tone={hardwareStatusTone(hardware.status)} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/shortcut-tutorial')} hitSlop={8}>
              <Text style={styles.howLink}>How it works</Text>
            </Pressable>
          </View>
          <View style={styles.shortcutBody}>
            <View style={styles.phoneVisual}>
              <View style={styles.phoneSpeaker} />
              <Ionicons name="volume-low" size={30} color={colors.navy} />
              <View style={styles.volumeButton} />
            </View>
            <View style={styles.shortcutCopy}>
              <Text style={styles.shortcutTitle}>Press volume down 5 times</Text>
              <Text style={styles.shortcutText}>Works while Core Alert is open and active.</Text>
            </View>
          </View>
          <View style={styles.pressRow} accessibilityLabel={`${hardware.pressCount} of 5 presses detected`}>
            {[0, 1, 2, 3, 4].map((index) => (
              <PressDot key={index} active={index < hardware.pressCount} number={index + 1} />
            ))}
          </View>
          {hardware.pressCount > 0 ? (
            <Text accessibilityLiveRegion="polite" style={styles.progressText}>{hardware.pressCount} of 5</Text>
          ) : null}
        </Card>

        <View style={styles.testBlock}>
          <Button label={state.preferences.demoModeEnabled ? 'Start Demo SOS' : 'Start prototype SOS'} variant="danger" icon={state.preferences.demoModeEnabled ? 'flask-outline' : 'alert-circle-outline'} onPress={runTest} style={styles.testButton} />
          <Text style={styles.testHelper}>{state.preferences.demoModeEnabled ? 'Linked guardians receive a clearly labelled demo alert.' : 'Linked guardians are alerted. Police are not contacted automatically.'}</Text>
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard icon="people-outline" title="Guardians" value={`${activeGuardians} ready`} tone={activeGuardians > 0 ? 'success' : 'warning'} onPress={() => router.push('/(tabs)/guardians')} />
          <SummaryCard icon="location-outline" title="Location" value={locationReady ? 'Available' : 'Needs access'} tone={locationReady ? 'success' : 'warning'} onPress={() => router.push('/location-details')} />
        </View>
      </ScrollView>

      <BottomSheet visible={detailsVisible} title="Shortcut details" onClose={() => setDetailsVisible(false)}>
        <View style={styles.detailRows}>
          <DetailRow label="Platform support" value={Platform.OS === 'android' ? 'Android prototype' : 'Android prototype only'} />
          <DetailRow label="Development build" value={hardware.nativeModuleAvailable ? 'Installed' : 'Required'} />
          <DetailRow label="Trigger availability" value={hardwareStatusLabel(hardware.status)} />
          <DetailRow label="Five-press window" value={`${hardwareTriggerService.windowMs / 1000} seconds`} />
        </View>
        <View style={styles.limitNote}>
          <Ionicons name="information-circle-outline" size={18} color={colors.navy} />
          <Text style={styles.limitText}>Foreground only. The shortcut does not work after force-close, process termination, suspension, or while Core Alert is inactive.</Text>
        </View>
        <Button label="Practice shortcut" variant="secondary" onPress={() => { setDetailsVisible(false); router.push('/shortcut-tutorial'); }} style={styles.sheetButton} />
      </BottomSheet>
    </Screen>
  );
}

function PressDot({ active, number }: { active: boolean; number: number }) {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!active) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.12, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [active, scale]);
  return (
    <Animated.View style={[styles.pressIndicator, active && styles.pressIndicatorActive, { transform: [{ scale }] }]}>
      <Text style={[styles.pressNumber, active && styles.pressNumberActive]}>{number}</Text>
    </Animated.View>
  );
}

function MiniStatus({ icon, label, ready }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; ready: boolean }) {
  return <View style={styles.miniStatus}><Ionicons name={icon} size={16} color={ready ? colors.green : colors.amber} /><Text style={styles.miniStatusText}>{label}</Text></View>;
}

function SummaryCard({ icon, title, value, tone, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; value: string; tone: 'success' | 'warning'; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.summaryCard, pressed && styles.pressed]}>
      <View style={styles.summaryIcon}><Ionicons name={icon} size={22} color={colors.navy} /></View>
      <Text style={styles.summaryTitle}>{title}</Text>
      <View style={styles.summaryStatus}><View style={[styles.summaryDot, { backgroundColor: tone === 'success' ? colors.green : colors.amber }]} /><Text style={styles.summaryValue}>{value}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.summaryChevron} />
    </Pressable>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 30, gap: 16 },
  incomingCard: { minHeight: 78, borderRadius: radii.medium, backgroundColor: colors.red, padding: 14, flexDirection: 'row', alignItems: 'center' }, incomingIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }, incomingCopy: { flex: 1, marginHorizontal: 11 }, incomingEyebrow: { color: '#FFE8E8', fontSize: 9, fontWeight: '800', letterSpacing: 0.7 }, incomingTitle: { color: colors.white, fontSize: 15, fontWeight: '800', marginTop: 3 },
  requestNotice: { minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }, requestNoticeText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  protectionCard: { padding: 16, borderColor: '#ABEFC6' },
  protectionRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green, marginRight: 11 },
  protectionCopy: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  protectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  protectionText: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  indicatorRow: { flexDirection: 'row', gap: 18, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  miniStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniStatusText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  shortcutCard: { padding: 18 },
  shortcutTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  howLink: { color: colors.navy, fontSize: 12, fontWeight: '700' },
  shortcutBody: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  phoneVisual: { width: 58, height: 94, borderRadius: 14, borderWidth: 2, borderColor: colors.navy, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  phoneSpeaker: { position: 'absolute', top: 8, width: 16, height: 2, borderRadius: 1, backgroundColor: colors.borderStrong },
  volumeButton: { position: 'absolute', left: -5, top: 25, width: 4, height: 26, borderRadius: 2, backgroundColor: colors.red },
  shortcutCopy: { flex: 1, marginLeft: 17 },
  shortcutTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  shortcutText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 5 },
  pressRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  pressIndicator: { flex: 1, height: 38, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  pressIndicatorActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  pressNumber: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  pressNumberActive: { color: colors.white },
  progressText: { color: colors.textSecondary, textAlign: 'center', fontSize: 11, fontWeight: '700', marginTop: 7 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  testBlock: { gap: 6 },
  testButton: { minHeight: 58 },
  testHelper: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  summaryGrid: { flexDirection: 'row', gap: 10, marginTop: 2 },
  summaryCard: { flex: 1, minHeight: 132, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, backgroundColor: colors.white, padding: 14 },
  summaryIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 10 },
  summaryStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  summaryDot: { width: 7, height: 7, borderRadius: 4 },
  summaryValue: { color: colors.textSecondary, fontSize: 11 },
  summaryChevron: { position: 'absolute', top: 17, right: 13 },
  detailRows: { gap: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.textSecondary, fontSize: 12 },
  detailValue: { color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  limitNote: { flexDirection: 'row', gap: 9, backgroundColor: '#EEF4F8', borderRadius: 12, padding: 12, marginTop: 16 },
  limitText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, flex: 1 },
  sheetButton: { marginTop: 16, marginBottom: 8 },
});
