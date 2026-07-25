import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmationModal } from '@/components/ConfirmationModal';
import { MapCard } from '@/components/MapCard';
import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import {
  getBackgroundLocationState,
  requestBackgroundLocationPermission,
  type BackgroundLocationState,
} from '@/services/backgroundLocationService';
import { openDeviceSettings } from '@/services/deviceActionService';
import { useApp } from '@/store/AppContext';
import { formatCoordinates } from '@/utils/format';

export default function LocationDetailsScreen() {
  const { location, requestLocationPermission, refreshLocation, showToast } = useApp();
  const [background, setBackground] = useState<BackgroundLocationState | null>(null);
  const [permissionVisible, setPermissionVisible] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const ready = location.permission === 'granted';
  useEffect(() => {
    let active = true;
    void getBackgroundLocationState().then((next) => { if (active) setBackground(next); });
    return () => { active = false; };
  }, []);

  const enableBackground = async () => {
    setPermissionVisible(false);
    setPermissionLoading(true);
    try {
      const next = await requestBackgroundLocationPermission();
      setBackground(next);
      showToast(next.permission === 'granted' ? 'Background sharing is ready for active SOS incidents' : 'Background location was not enabled');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Background location could not be enabled.');
    } finally {
      setPermissionLoading(false);
    }
  };
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.icon}><Ionicons name="location" size={25} color={colors.navy} /></View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Current location</Text>
            <Text style={styles.subtitle}>Used only for live sharing during an active SOS.</Text>
          </View>
          <StatusBadge label={ready ? 'Available' : 'Off'} tone={ready ? 'success' : 'warning'} />
        </View>

        {location.loading ? (
          <LocationSkeleton />
        ) : (
          <MapCard coordinates={location.coordinates} height={300} />
        )}

        <Card>
          <Text style={styles.cardLabel}>APPROXIMATE COORDINATES</Text>
          <Text style={styles.coordinates}>{formatCoordinates(location.coordinates)}</Text>
          <Text style={styles.note}>Throttled points are stored in Supabase and visible only to the account owner and assigned guardians.</Text>
        </Card>

        <Card>
          <View style={styles.backgroundHeader}>
            <View style={styles.backgroundCopy}>
              <Text style={styles.backgroundTitle}>Background SOS sharing</Text>
              <Text style={styles.note}>An ongoing Android notification keeps location sharing active when Core Alert is backgrounded.</Text>
            </View>
            <StatusBadge
              label={background?.permission === 'granted' ? (background.running ? 'Active now' : 'Ready') : 'Optional'}
              tone={background?.permission === 'granted' ? 'success' : 'neutral'}
            />
          </View>
          <Text style={styles.limit}>Android may stop tracking after force-close, device restart, battery restriction, or vendor task killing. Core Alert never describes this as guaranteed protection.</Text>
          {background?.permission !== 'granted' ? (
            <Button label="Enable for active SOS" variant="secondary" icon="shield-outline" loading={permissionLoading} disabled={!ready} onPress={() => setPermissionVisible(true)} style={styles.cardButton} />
          ) : (
            <Button label="Open Android location settings" variant="secondary" icon="settings-outline" onPress={() => { void openDeviceSettings().catch((error) => showToast(error.message)); }} style={styles.cardButton} />
          )}
        </Card>

        <Button
          label={ready ? 'Refresh location' : 'Enable location'}
          icon={ready ? 'refresh-outline' : 'location-outline'}
          loading={location.loading}
          onPress={ready ? refreshLocation : requestLocationPermission}
        />
        {location.error ? <Text style={styles.error}>{location.error}</Text> : null}
      </ScrollView>
      <ConfirmationModal
        visible={permissionVisible}
        title="Allow background SOS location?"
        message="When an SOS is active, Core Alert will show a persistent Android notification and continue sharing throttled location points with assigned guardians while the app is backgrounded. You can revoke this in Android Settings. Tracking stops when the SOS ends and may stop if Android terminates the app."
        confirmLabel="Continue to Android"
        onConfirm={() => { void enableBackground(); }}
        onCancel={() => setPermissionVisible(false)}
      />
    </SafeAreaView>
  );
}

function LocationSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading location">
      <View style={styles.skeletonIcon} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLineShort} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: 16, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, marginHorizontal: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  cardLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  coordinates: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 7 },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 },
  backgroundHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  backgroundCopy: { flex: 1 },
  backgroundTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  limit: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 12 },
  cardButton: { marginTop: 16 },
  error: { color: colors.redDark, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  skeleton: { height: 350, borderRadius: 16, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', gap: 12 },
  skeletonIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#D0D5DD' },
  skeletonLine: { width: 150, height: 12, borderRadius: 6, backgroundColor: '#D0D5DD' },
  skeletonLineShort: { width: 96, height: 9, borderRadius: 5, backgroundColor: '#D0D5DD' },
});
