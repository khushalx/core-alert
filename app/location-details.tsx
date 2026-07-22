import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MapCard } from '@/components/MapCard';
import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useApp } from '@/store/AppContext';
import { formatCoordinates } from '@/utils/format';

export default function LocationDetailsScreen() {
  const { location, requestLocationPermission, refreshLocation } = useApp();
  const ready = location.permission === 'granted';
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.icon}><Ionicons name="location" size={25} color={colors.navy} /></View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Current location</Text>
            <Text style={styles.subtitle}>Used for foreground live sharing during an active SOS.</Text>
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
          <Text style={styles.note}>During an active SOS, throttled points are stored in Supabase and shared only with assigned linked guardians. Continuous background protection is still under development.</Text>
        </Card>

        <Button
          label={ready ? 'Refresh location' : 'Enable location'}
          icon={ready ? 'refresh-outline' : 'location-outline'}
          loading={location.loading}
          onPress={ready ? refreshLocation : requestLocationPermission}
        />
        {location.error ? <Text style={styles.error}>{location.error}</Text> : null}
      </View>
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
  content: { flex: 1, padding: spacing.lg, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, marginHorizontal: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  cardLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  coordinates: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 7 },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 },
  error: { color: colors.redDark, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  skeleton: { height: 350, borderRadius: 16, backgroundColor: '#EAECF0', alignItems: 'center', justifyContent: 'center', gap: 12 },
  skeletonIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#D0D5DD' },
  skeletonLine: { width: 150, height: 12, borderRadius: 6, backgroundColor: '#D0D5DD' },
  skeletonLineShort: { width: 96, height: 9, borderRadius: 5, backgroundColor: '#D0D5DD' },
});
