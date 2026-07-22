import { Redirect } from 'expo-router';

import { LoadingState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';

export default function IndexScreen() {
  const { hydrated } = useApp();
  const { configured, loading, session } = useAuth();
  if (!hydrated || loading) {
    return (
      <Screen>
        <LoadingState label="Preparing Core Alert…" />
      </Screen>
    );
  }
  if (!configured || !session) return <Redirect href="/welcome" />;
  return <Redirect href="/(tabs)" />;
}
