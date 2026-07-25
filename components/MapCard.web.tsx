import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';
import type { Coordinates } from '@/types';
import { formatCoordinates } from '@/utils/format';

export function MapCard({
  coordinates,
  incidentCoordinates,
  height = 180,
  path = [],
}: {
  coordinates: Coordinates | null;
  incidentCoordinates?: Coordinates | null;
  height?: number;
  label?: string;
  path?: Coordinates[];
}) {
  const focus = coordinates ?? incidentCoordinates ?? null;
  return (
    <View style={[styles.placeholder, { height }]}>
      <Ionicons name="map-outline" size={30} color={colors.navy} />
      <Text style={styles.title}>Mobile map preview</Text>
      <Text style={styles.text}>{formatCoordinates(focus)}{path.length ? ` • ${path.length} points` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  title: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 8 },
  text: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
