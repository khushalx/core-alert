import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';
import type { Coordinates } from '@/types';
import { formatCoordinates } from '@/utils/format';

type MapCardProps = {
  coordinates: Coordinates | null;
  incidentCoordinates?: Coordinates | null;
  height?: number;
  label?: string;
  path?: Coordinates[];
};

export function MapCard({ coordinates, incidentCoordinates, height = 180, label, path = [] }: MapCardProps) {
  const focus = coordinates ?? incidentCoordinates;
  if (!focus) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Ionicons name="map-outline" size={29} color={colors.textMuted} />
        <Text style={styles.placeholderTitle}>Map location unavailable</Text>
        <Text style={styles.placeholderText}>Coordinates will appear here when location is available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        accessibilityLabel={`Location preview: ${formatCoordinates(focus)}`}
        style={[styles.preview, { height }]}>
        <View style={[styles.gridLine, styles.gridHorizontalTop]} />
        <View style={[styles.gridLine, styles.gridHorizontalBottom]} />
        <View style={[styles.gridLine, styles.gridVerticalLeft]} />
        <View style={[styles.gridLine, styles.gridVerticalRight]} />
        <View style={styles.previewMarker}>
          <Ionicons name="location" size={28} color={colors.white} />
        </View>
        <Text style={styles.previewTitle}>Secure location preview</Text>
        <Text style={styles.previewCoordinates}>{formatCoordinates(focus)}</Text>
        {path.length > 1 ? <Text style={styles.previewPath}>{path.length} recorded location points</Text> : null}
      </View>
      <View style={styles.caption}>
        <View style={styles.availableDot} />
        <View style={styles.captionText}>
          <Text style={styles.captionTitle}>{label ?? 'Location available'}</Text>
          <Text style={styles.coordinates}>{formatCoordinates(focus)}{path.length > 0 ? ` • ${path.length} points` : ''}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border },
  preview: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#071426',
  },
  gridLine: { position: 'absolute', backgroundColor: '#17304A' },
  gridHorizontalTop: { top: '33%', left: 0, right: 0, height: 1 },
  gridHorizontalBottom: { top: '66%', left: 0, right: 0, height: 1 },
  gridVerticalLeft: { left: '33%', top: 0, bottom: 0, width: 1 },
  gridVerticalRight: { left: '66%', top: 0, bottom: 0, width: 1 },
  previewMarker: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.red,
    borderWidth: 6,
    borderColor: '#45141D',
  },
  previewTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 10 },
  previewCoordinates: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  previewPath: { color: colors.blueBright, fontSize: 10, fontWeight: '700', marginTop: 5 },
  caption: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 13 },
  availableDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green, marginRight: 9 },
  captionText: { flex: 1 },
  captionTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  coordinates: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  placeholder: {
    borderRadius: radii.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.backgroundSecondary,
  },
  placeholderTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 8 },
  placeholderText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
});
