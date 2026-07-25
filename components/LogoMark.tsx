import { Image, StyleSheet, View } from 'react-native';

type LogoMarkProps = {
  size?: number;
  lockup?: boolean;
};

const logo = require('../assets/images/core-alert-logo.jpeg');

/**
 * Uses the supplied finalized artwork without recoloring or distortion.
 * The compact variant only clips the shield area for small navigation zones;
 * the source image itself remains unchanged.
 */
export function LogoMark({ size = 42, lockup = false }: LogoMarkProps) {
  if (lockup) {
    return (
      <Image
        accessibilityLabel="Core Alert — Every Second Counts"
        source={logo}
        resizeMode="contain"
        style={{ width: size * 0.914, height: size }}
      />
    );
  }
  return (
    <View
      accessibilityLabel="Core Alert shield"
      style={[styles.markCrop, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Image
        source={logo}
        resizeMode="contain"
        style={{
          position: 'absolute',
          width: size * 1.64,
          height: size * 1.795,
          left: -size * 0.32,
          top: -size * 0.1,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  markCrop: {
    overflow: 'hidden',
    backgroundColor: '#03050A',
  },
});
