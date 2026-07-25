import { Linking } from 'react-native';

export async function openDeviceUrl(url: string, failureMessage: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    throw new Error(failureMessage);
  }
}

export async function openDeviceSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    throw new Error('Android settings could not be opened on this device.');
  }
}
