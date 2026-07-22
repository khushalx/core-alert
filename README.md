# Core Alert — Phase 3

Core Alert is an Expo SDK 57 React Native safety prototype with authenticated guardian linking, Supabase-backed SOS incidents, foreground live location sharing, realtime guardian acknowledgements, and an Android foreground volume-down shortcut.

Core Alert does **not** contact police or emergency services automatically. SMS and WhatsApp delivery are not connected. Live location and the hardware shortcut currently require the application to remain active under the documented supported conditions.

## Phase 3 capabilities

- Email/password account creation, sign-in, password-reset email, sign-out, and persisted sessions
- Supabase profile storage with one-time local emergency-profile import
- Linked guardians through one-time invite codes
- Contact-only guardians that are never shown as notified
- Incoming guardian requests and “People I protect” views
- Real Supabase incident creation from the SOS button and Android hardware shortcut
- Demo incidents that remain clearly labelled while still exercising the connected data path
- Accepted-guardian assignment, secure push delivery through an Edge Function, and per-guardian delivery status
- Foreground live location updates with time/distance throttling
- AsyncStorage offline location queue and retry using the original incident ID
- Realtime incident, location, acknowledgement, and newly assigned-alert subscriptions
- Guardian actions for responding, declining, calling the user, and opening navigation
- Supabase-backed activity history and incident details
- Existing practice mode, diagnostics, countdown, and clean four-tab interface

## Requirements

- Node.js 22.13 or newer
- npm
- A Supabase project
- Supabase CLI for migrations and Edge Function deployment
- Expo/EAS account for Android push credentials and development builds
- JDK 17 and Android SDK 36 for local Android builds
- Two physical devices for the full guardian demo

Remote push notifications on Android require a development build; they are not available through Expo Go for this SDK and feature set.

## 1. Install dependencies

```bash
cd "/Users/khushaldangar/Desktop/Core Alert"
npm install
```

For local Android compilation on Apple Silicon macOS:

```bash
brew install openjdk@17 android-commandlinetools

JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools --licenses

JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "cmake;3.22.1"
```

## 2. Configure Supabase

Create a Supabase project, then copy the public Project URL and anonymous/publishable key from the project API settings.

```bash
cp .env.example .env.local
```

Fill in only these client-safe values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

Both `.env` and `.env.local` are ignored by Git. Never add the Supabase service-role or secret key to an `EXPO_PUBLIC_` variable. Expo public variables are bundled into the application and are not private.

### Apply the database migration

The migration creates all Phase 3 tables, constraints, indexes, Auth profile trigger, updated-at triggers, invitation/acknowledgement RPCs, Realtime publication entries, and Row Level Security policies.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

No Phase 3 table needs to be created manually in the dashboard.

Migration:

```text
supabase/migrations/202607230001_phase3.sql
```

### Authentication settings

In Supabase Authentication:

1. Enable Email authentication.
2. For a fast two-device hackathon demo, either disable email confirmation for test accounts or confirm both test emails before signing in.
3. Add `corealert://reset-password` to the allowed redirect URLs if password-reset deep links will be tested.

## 3. Deploy the secure notification function

The mobile client never sends arbitrary Expo push messages and never contains a service-role key. It invokes an authenticated Edge Function with an incident ID. The function verifies the caller, confirms incident ownership, fetches only assigned guardians, sends demo-aware messages, and updates delivery results.

```bash
npx supabase functions deploy send-sos-notifications
```

Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions. The service-role key remains server-side.

Function source:

```text
supabase/functions/send-sos-notifications/
```

## 4. Configure Expo push notifications

Initialize or link the EAS project so `extra.eas.projectId` is available to `getExpoPushTokenAsync`:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

Configure Android FCM v1 credentials through EAS, following Expo’s push-notification credential setup. The `expo-notifications` config plugin and the `sos-alerts` Android channel are already configured.

Because the notification plugin changes native configuration, rebuild the development app after adding it.

## 5. Preserve the native hardware bridge

The committed `android/` directory contains hand-maintained Kotlin code:

```text
android/app/src/main/java/com/corealert/prototype/CoreAlertHardwareModule.kt
android/app/src/main/java/com/corealert/prototype/CoreAlertHardwarePackage.kt
android/app/src/main/java/com/corealert/prototype/MainActivity.kt
android/app/src/main/java/com/corealert/prototype/MainApplication.kt
```

Do not run `npx expo prebuild --clean` without preserving these changes. Expo Doctor’s app-config sync warning is intentionally disabled because the native Android project is committed. Apply future native configuration changes to both `app.json` and the Android project.

## 6. Build and install the development app

### EAS development APK

```bash
npx eas-cli@latest build --platform android --profile development
```

### Local debug APK

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

cd android
./gradlew :app:assembleDebug
cd ..
```

The APK is generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it over USB:

```bash
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 7. Start Core Alert

The phone and computer must be on the same network:

```bash
npx expo start --dev-client --lan
```

Use `--tunnel` if LAN discovery is blocked:

```bash
npx expo start --dev-client --tunnel
```

Open the installed **Core Alert** development app and scan the development-client QR. Do not scan an APK-download URL inside the development launcher; APK links belong in the phone browser.

## Guardian linking

1. Sign in as the protected user.
2. Open **Guardians → Add guardian**.
3. Enter the second account’s email, phone, relationship, and optional primary setting.
4. Share the generated message containing the `CA-####` code.
5. Sign in as the guardian on the second device.
6. Open **Settings → Enter invite code**, verify the protected user’s name, and accept.
7. Confirm both accounts show the relationship as linked/ready.

Phone-only contacts are displayed as **Contact only / Not linked**. They are not assigned to incidents, and Core Alert does not claim that they received a notification.

## Two-device demo test

### Preparation

- Create and confirm two separate test accounts.
- Install the same current development build on both devices.
- Sign in on each device and allow foreground location.
- On Device B, enable notifications from Settings after reading the explanation.
- Link Device B as an accepted guardian for Device A.
- Keep both applications active for foreground location testing.

### Device A — protected user

1. Confirm **Demo mode** is enabled in Settings.
2. Verify Device B appears as a linked **Ready** guardian.
3. Tap **Start Demo SOS**, or press volume down five separate times within three seconds while Core Alert is active.
4. Let the countdown finish.
5. Verify the active screen shows a Supabase incident, assigned guardian count, location state, and no police-contact claim.

### Device B — guardian

1. Receive the in-app realtime alert or push notification.
2. Open the alert and confirm the **Demo SOS** label remains visible.
3. Verify Device A’s initial/current location and last-update time.
4. Tap **I’m responding**.
5. Optionally test **Call user** and **Open in Maps**.

### Back on Device A

1. Verify the acknowledgement count changes in real time.
2. Move with Device A and wait 5–10 seconds or move at least about 10 metres.
3. Verify Device B receives a later location point.
4. Tap **I am safe — end SOS**.

### Both devices

1. Confirm the guardian screen changes from active to ended.
2. Confirm Device A’s incident appears in cloud Activity history.
3. Open incident details and verify location points and guardian acknowledgements.
4. Confirm demo labels remain visible.
5. Confirm no screen claims that police or emergency services were contacted.

## Offline behavior

During a temporary connection loss:

- The active SOS stays visible using cached state.
- Realtime status changes to **Reconnecting** or **Offline**.
- Throttled location updates are queued in AsyncStorage.
- Reconnection retries the queue using the original incident ID.
- The app never changes a failed delivery into a successful one without server confirmation.

This is a small retry queue, not a general offline-sync engine.

## Security and RLS overview

- The client contains only the public Supabase URL and anonymous/publishable key.
- Every personal-data table has RLS enabled.
- Profiles are directly readable only by their owner. Guardians receive a restricted name/phone/avatar summary through a checked function; medical fields are not exposed through that function.
- Guardian relationships are visible only to the protected user or addressed guardian.
- Invitation acceptance is a security-definer function that validates the authenticated account, invite email, one-time code, self-invite rule, and duplicate-link rule.
- Protected users cannot forge accepted relationships or alter server-managed link fields.
- Incidents are readable by their owner and assigned guardians only.
- Only incident owners can insert location history; guardians cannot edit it.
- Guardian acknowledgements go through a checked function and affect only the caller’s assignment.
- Push tokens are private to their owning account.
- The Edge Function validates its input and incident ownership before using its server-side service role.
- Medical fields are not included in technical logs.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npx expo-doctor
npx expo export --platform android
```

Run database policy tests with a local Supabase stack:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

Run the Edge Function authorization tests when Deno is installed:

```bash
deno test supabase/functions/send-sos-notifications/authorization_test.ts
```

The Jest suite covers account creation, session restoration, guardian creation/acceptance/rejection, self- and duplicate-invite prevention, incident creation, guardian assignment, location throttling, acknowledgements, realtime callbacks, incident resolution, offline queue replay, notification denial, Edge Function ownership, RLS migration safeguards, and the Phase 2A hardware sequence.

## Current limitations

- Foreground live location only; reliable killed-app/background tracking is not implemented.
- The Android volume shortcut works only under its documented foreground conditions.
- Push notification delivery requires valid EAS/FCM credentials and a physical development-build device.
- Contact-only guardians do not receive SMS.
- No WhatsApp alerts, automatic calls, police dispatch, responder dashboard, or emergency-services integration.
- Network recovery is intentionally lightweight.
- Core Alert remains a hackathon prototype and is not a replacement for official emergency services.

## Phase 4 roadmap

- Carefully designed background/killed-app protection with explicit battery and privacy controls
- Production notification receipts, invalid-token cleanup, and delivery retries
- Verified SMS fallback through a secure server provider
- Richer guardian routing and escalation rules
- Account deletion, data export, audit history, and production observability
- Accessibility, localization, security review, and store-release hardening
- Optional responder integrations only after policy, legal, and operational validation

## Primary references

- Expo SDK 57: https://docs.expo.dev/versions/v57.0.0/
- Expo Notifications SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- Expo Location SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/location/
- Supabase React Native Auth: https://supabase.com/docs/guides/auth/quickstarts/react-native
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Realtime database changes: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase Edge Function security: https://supabase.com/docs/guides/functions/auth
