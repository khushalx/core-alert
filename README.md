<<<<<<< HEAD

=======
# Core Alert — final hackathon prototype

Core Alert is an Android-first Expo SDK 57 safety app. A protected user can start a real cloud-backed SOS, share live location with trusted guardians, receive acknowledgements, and hand off an emergency call to the Android dialer. It preserves the existing calm, progressively disclosed UI and becomes urgent only during an active SOS.

## Safety statement

Core Alert is a hackathon prototype, not an emergency-service integration or a replacement for official emergency services.

- Push notifications and SMS can be sent to guardians only after their providers are configured.
- Location is shared only for an active incident and only with its owner and assigned guardians.
- The emergency-call action opens the phone dialer; it does not prove that a call was placed, connected, or answered.
- Core Alert does not dispatch police. The responder screen is labelled **HACKATHON SIMULATION** and is available only for Demo SOS incidents.
- No UI or server message claims “Police notified.”

## Implemented capabilities

- Supabase email/password authentication, session restoration, password reset, and protected profiles
- Emergency profile with a one-time import from the original local prototype
- Guardian invitation codes, acceptance/decline, primary guardian, linked and contact-only records
- Five-volume-down Android shortcut through a narrowly scoped Accessibility service, including locked/background/removed-from-recents states where Android keeps the service alive
- Cancelable SOS countdown, Demo SOS mode, and real Supabase incident creation
- Native Android emergency evidence capture: CameraX MP4 video with its own audio track, native AAC/M4A fallback, private app storage, visible foreground-service disclosure, and WorkManager upload recovery
- Foreground live location plus optional Android background sharing during an active SOS
- AsyncStorage incident cache and offline location retry queue
- Loud Expo push alerts with vibration, public lock-screen visibility, response/location actions, token rotation, invalid-token cleanup, and provider-acceptance records
- Optional Twilio SMS fallback from the server only
- Guardian realtime alerts, live map, responding/declined acknowledgements, navigation, and call-user actions
- Configurable guardian-timeout escalation through a protected scheduled Edge Function
- Emergency-number dialer handoff with an honest audit event
- Supabase incident history with delivery, acknowledgement, location, escalation, and dialer events
- Demo-only simulated responder timeline with explicit no-police/no-dispatch labels
- In-app system diagnostics without exposing tokens, medical fields, user IDs, or exact coordinates
- Local Jest, ESLint, TypeScript, database RLS, and Edge Function authorization tests

## Requirements

- macOS with Android Studio and Android SDK 36
- Android Studio JBR/JDK 17 or newer; the bundled JDK 21 works
- Node.js 22 LTS or newer and npm
- Supabase project and Supabase CLI
- EAS/Expo account and Android FCM v1 credentials for remote push
- One Android device for installation; two accounts/devices for the full guardian test
- Optional Twilio account/number for real SMS fallback

Expo Go is not supported: this project has native Kotlin, a development client, background-location configuration, and remote push requirements.

## 1. Install and verify Android tooling

```bash
cd "/Users/khushaldangar/Desktop/Core Alert"
npm install

export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

java -version
adb version
```

The terminal's default `java` may still be Java 8. Always export `JAVA_HOME` before Gradle commands. The committed Gradle settings use a 3 GB heap and a 768 MB metaspace limit to avoid the earlier local build memory failure.

Confirm `android/local.properties` points to the SDK. Do not commit this machine-specific file.

```properties
sdk.dir=/Users/YOUR_MAC_USERNAME/Library/Android/sdk
```

Install missing SDK packages from Android Studio → Settings → Android SDK, or with:

```bash
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "cmake;3.22.1"
```

## 2. Configure Supabase

```bash
cp .env.example .env.local
```

Set only client-safe values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

Never put a service-role key, secret key, Twilio token, or Cron secret in an `EXPO_PUBLIC_` variable. Expo public variables are compiled into the app.

Apply all migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

- `supabase/migrations/202607230001_phase3.sql`: profiles, relationships, incidents, location, acknowledgements, push tokens, RPCs, RLS, and Realtime
- `supabase/migrations/202607230002_final_phase.sql`: delivery recipients, escalation/audit events, contact-only routing, dialer handoff, responder simulation, RLS, and Realtime
- `supabase/migrations/202607230003_background_protection.sql`: revocable native-device credentials, idempotent native activation IDs, per-provider notification records, notification-action acknowledgements, RLS, and Realtime
- `supabase/migrations/202607240004_native_evidence.sql`: private evidence metadata and Storage bucket, owner/assigned-guardian read policies, and Realtime publication
- `supabase/migrations/202607250005_sos_lifecycle_reliability.sql`: one-active-incident protection, idempotent create/resolve/location RPCs, and one initial guardian-delivery claim per incident

Authentication dashboard setup:

1. Enable Email authentication.
2. Confirm both test accounts, or disable email confirmation only for a controlled hackathon project.
3. Add `corealert://reset-password` to allowed redirect URLs when testing reset links.

## 3. Deploy native activation, guardian push, and optional SMS

The app sends only an incident ID to `send-sos-notifications`. The function authenticates the caller, verifies ownership and active status, reads server-authorized recipients, then records provider results.

```bash
npx supabase functions deploy send-sos-notifications
npx supabase functions deploy manage-native-protection
npx supabase functions deploy activate-native-sos --no-verify-jwt
npx supabase functions deploy manage-native-evidence --no-verify-jwt
```

`activate-native-sos` intentionally does not use a user JWT because the React Native runtime may not be running. It rejects requests unless they carry a server-issued, revocable device ID and secret. The secret is returned once, stored encrypted with Android Keystore, and stored only as a SHA-256 hash in Supabase. `manage-native-protection` still requires the signed-in user.

`manage-native-evidence` uses the same revocable device credential. It validates incident ownership, creates a short-lived signed upload URL for a server-controlled path, and never exposes the service-role key to the APK. Evidence remains in the private `incident-evidence` bucket; authenticated reads are limited by RLS to the protected user and guardians assigned to that incident.

Push requires the EAS project ID already present in `app.json` and Android FCM v1 credentials:

```bash
npx eas-cli@latest login
npx eas-cli@latest credentials --platform android
```

For optional SMS, create a private file from `supabase/functions/.env.example`, fill the Twilio values, then set hosted secrets:

```bash
cp supabase/functions/.env.example supabase/functions/.env
npx supabase secrets set --env-file supabase/functions/.env
```

Enable SMS only after the credentials and sender number work:

```env
SMS_FALLBACK_ENABLED=true
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+15551234567
```

Guardian phone numbers must be E.164, including `+` and country code. The app never guesses a country. SMS is attempted for a contact-only recipient or when linked-guardian push was not accepted. “Sent” means the provider accepted the request, not that a person read it.

## 4. Deploy escalation

Create a random secret of at least 24 characters and use the same value for the Edge Function and Supabase Vault:

```bash
openssl rand -hex 32
npx supabase secrets set ESCALATION_CRON_SECRET=YOUR_RANDOM_VALUE ESCALATION_AFTER_SECONDS=90
npx supabase functions deploy process-incident-escalations --no-verify-jwt
```

Edit only the two placeholders in `supabase/templates/setup_escalation_cron.sql`, then run it in the Supabase SQL editor. It stores the project URL and shared secret in Vault and schedules a once-per-minute `pg_net` call. The function is idempotent per incident timeout and stops escalation after any guardian marks themselves responding.

The protected function has JWT verification disabled because the scheduler is not a user, but every request must contain the separate long `x-core-alert-cron-secret`. Never invoke it directly from the mobile client.

## 5. Build and install Android

### Local debug APK

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

cd "/Users/khushaldangar/Desktop/Core Alert/android"
./gradlew --stop
./gradlew :app:assembleDebug
cd ..
```

APK output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install over USB:

```bash
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Local standalone hackathon APK

This bundles the JavaScript into the APK and opens without Metro:

```bash
export NODE_ENV=production
cd "/Users/khushaldangar/Desktop/Core Alert/android"
./gradlew :app:assembleRelease
cd ..

adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

The current local `release` variant is signed with the repository's debug certificate for hackathon installation only. Use EAS or a protected production keystore for any distributed/store release.

### Downloadable EAS APK

```bash
npx eas-cli@latest build --platform android --profile preview
```

The EAS build page provides a phone-download URL and QR code. The `preview` profile is a standalone internal APK. The `development` profile is a development-client APK that still connects to Metro.

### Development-client run commands

```bash
npx expo start --dev-client --lan
```

If LAN discovery is blocked:

```bash
npx expo start --dev-client --tunnel
```

Open the installed **Core Alert** app and scan the Metro QR. Do not use Expo Go; its SDK/native runtime can be incompatible even when Play Store shows no update.

## 6. Native-project rule

The committed Android project contains the custom hardware bridge:

```text
android/app/src/main/java/com/corealert/prototype/MainActivity.kt
android/app/src/main/java/com/corealert/prototype/CoreAlertAccessibilityService.kt
android/app/src/main/java/com/corealert/prototype/CoreAlertNativeCountdown.kt
android/app/src/main/java/com/corealert/prototype/CoreAlertNativeLocationService.kt
android/app/src/main/java/com/corealert/prototype/CoreAlertEmergencyCountdownActivity.kt
android/app/src/main/java/com/corealert/prototype/CoreAlertEvidenceForegroundService.kt
android/app/src/main/java/com/corealert/prototype/CoreAlertEvidenceStore.kt
android/app/src/main/java/com/corealert/prototype/CoreAlertEvidenceUploadWorker.kt
android/app/src/main/java/com/corealert/prototype/MainApplication.kt
modules/core-alert-hardware/expo-module.config.json
modules/core-alert-hardware/android/src/main/java/com/corealert/prototype/CoreAlertSosCoordinator.kt
modules/core-alert-hardware/android/src/main/java/com/corealert/prototype/CoreAlertVolumeSequenceManager.kt
modules/core-alert-hardware/android/src/main/java/com/corealert/prototype/CoreAlertVolumeEventBus.kt
modules/core-alert-hardware/android/src/main/java/com/corealert/prototype/CoreAlertHardwareModule.kt
```

The Accessibility service requests only key filtering, observes distinct initial volume-down presses, returns `false` so Android keeps normal volume behavior, and does not read screen text, perform gestures, or control other apps. Accessibility and `MainActivity` both pass physical events to the same monotonic native sequence manager; the event timestamp deduplicates a key event seen by both. JavaScript counts only explicit diagnostic simulations. The fifth native press opens the lock-screen-capable countdown Activity before secure cloud activation. Only that visible Activity may start the camera/microphone foreground service. Accessibility, receivers, the Application class, and background-only services never start a recorder.

### SOS lifecycle and service ownership

The persisted native coordinator and the JavaScript transition gate enforce:

```text
IDLE → COUNTDOWN → ACTIVATING → ACTIVE → ENDING → RESOLVED → IDLE
                                  ↘ ENDING_FAILED → ENDING
               ↘ ACTIVATION_FAILED → IDLE
```

- `CoreAlertAccessibilityService`: global shortcut observer; remains enabled after an incident ends.
- Native protection configuration: global device credential and shortcut preferences; remains configured while Protection Mode is enabled.
- `CoreAlertNativeLocationService` and the Expo active-incident location task: incident-scoped; both reject stale/non-active incident IDs and stop after resolution.
- `CoreAlertEvidenceForegroundService`: incident-scoped; the existing implementation is asked to stop/finalize during resolution.
- Countdown, location, evidence, upload, and guardian-alert notifications use separate IDs/channels. Ending an incident cancels only incident-scoped foreground notifications.

Pending activations carry a UUID, source, created time, consumed time, and status. They expire after 60 seconds, are claimed atomically once, and are cleared on cancellation, successful activation, sign-out, or protection disable. The database uses the same UUID for idempotent incident creation.

The evidence engine does not use Expo camera, audio, FileSystem, or background-task APIs and does not depend on the JavaScript runtime after Android starts it. CameraX records one MP4 video stream with its own microphone track; it never runs a second microphone recorder concurrently. When video is unavailable, native `MediaRecorder` records AAC in an MPEG-4/M4A container. Five-minute or 100 MB finalized segments are kept under private `filesDir`, uploaded by constrained WorkManager jobs, and deleted locally only after the server confirms completion. A recording failure never blocks SOS activation.

Do not run `npx expo prebuild --clean` because this repository contains hand-maintained native code. Keep native permission/config changes synchronized between `app.json` and `android/`.

### Physical-device shortcut verification

Install the current build, sign in, then:

1. Open Settings → Volume-down shortcut and enable protection.
2. Tap **Open Accessibility settings** and manually enable **Core Alert hardware protection**.
3. Allow notifications. Enable foreground/background location if live tracking is part of the test.
4. Remove battery restrictions for Core Alert if the phone manufacturer applies them.
5. Open Settings → Shortcut diagnostics and confirm Accessibility, native protection, and native cloud activation all show ready.
6. Open Settings → Emergency evidence, read the disclosure, and grant camera and microphone access for a consented real-mode test.

In a second terminal:

```bash
adb logcat -c
adb logcat -s CoreAlertVolume:D
```

With Core Alert visible, press volume-down five distinct times in under three seconds. Expected native order includes:

```text
MainActivity received volume down
Event bus published event
Module emitted event to JavaScript
```

The diagnostic screen should show increasing native press values and finally `Native protection started the SOS countdown`. JavaScript may display those native results, but it does not run a second physical-button counter. Holding the button must not count as five separate presses. Android's normal media-volume behavior must continue, including when volume is already zero.

Repeat the test separately with the app backgrounded, removed from recents, and the phone locked. The fifth press should open the visible native countdown, followed by a real Supabase incident and guardian alert if cloud/network/provider setup is valid. In real mode, granted camera/microphone permission should produce a persistent evidence notification and Android privacy indicator. End the incident, wait for the private upload notification to finish, then confirm evidence appears on the incident screen for the owner and assigned guardian but not for an unrelated account. Confirm every state on a physical device; a successful Gradle build cannot prove a phone manufacturer’s background policy.

Do not test or advertise support after Android Settings → Apps → Core Alert → **Force stop**. Android prevents the app and Accessibility service from running again until the user explicitly opens the app. The shortcut also cannot operate when protection, Accessibility, or notifications are disabled, or when the OS/OEM kills or restricts the service.

## 7. End-to-end demo

Preparation:

1. Apply migrations and deploy `send-sos-notifications`, `manage-native-protection`, `activate-native-sos`, `manage-native-evidence`, and `process-incident-escalations`.
2. Install the same current build on two Android devices.
3. Create/confirm protected-user and guardian accounts.
4. Add the guardian, share the `CA-####` invite, and accept it on the guardian device.
5. Enable notifications on the guardian device.
6. On the protected device, open Location details and explicitly enable background sharing if it is part of the demo.

Run:

1. Keep Demo mode enabled for the safe hackathon flow.
2. Start Demo SOS from Home or press volume-down five distinct times within three seconds after enabling Accessibility protection.
3. Let the countdown finish and confirm a cloud incident appears.
4. Verify the guardian receives Realtime/push and opens the live map.
5. Tap **I’m responding** and confirm the protected device updates in real time.
6. Background the protected app, move, and verify later coordinates while Android permits the foreground service.
7. Inspect push/SMS/escalation provider results on the incident screen.
8. Open the Demo incident's responder simulation and advance its labelled simulated timeline.
9. Test the emergency-call confirmation; cancel at the dialer unless a real call is intended.
10. End the SOS and confirm location sharing stops and Activity contains the history.

For a real-mode test, notify every participant first, use only your own devices/numbers, and do not place a real emergency call.

## Emergency evidence behavior and limits

- Evidence is off in Demo mode.
- Camera and microphone permissions are requested only from a visible Activity after an in-app/native disclosure. Android’s persistent notification and camera/microphone indicators remain visible during capture.
- Video with its own audio track is preferred. Audio-only is the fallback. Core Alert never starts CameraX audio and a second `MediaRecorder` microphone capture together.
- Recording starts only after the SOS countdown completes. Cancelling the countdown does not record.
- Ending the incident stops and finalizes the current segment. Completed segments retry on a network connection through WorkManager.
- A failed, denied, unavailable, or OEM-blocked recorder is reported in Diagnostics while the SOS and guardian workflow continue.
- Manual Android Force stop, revoked permission, device storage pressure, OEM restrictions, and hardware resource conflicts can prevent capture. The app does not claim otherwise.
- Treat recordings as sensitive personal data. Define a retention/deletion policy before any production use; the hackathon prototype does not replace legal review or emergency-service integration.

## Location behavior and Android limits

- Foreground permission is requested during setup or from Location details.
- Background permission is a separate, explained opt-in; on modern Android it may open system Settings.
- Background updates run only for an active incident with a visible Android foreground-service notification.
- Ending the incident unregisters the task and clears its local incident state.
- Failed writes enter the bounded AsyncStorage queue and retry against the original incident ID after reconnection.
- Android may stop updates after manual Force stop, device restart, OEM battery restriction, revoked permission, or OS policy. Core Alert does not promise automatic restart or Force-stop recovery.

## Diagnostics

Open Settings → **System diagnostics**. It reports configuration, session, Realtime, network, foreground/background permission/task, notification/push readiness, guardian counts, offline queue, native bridge/listener, app, and device state. The dedicated shortcut diagnostic remains available for five-click timing tests.

Diagnostics deliberately omit tokens, keys, user IDs, medical data, guardian details, and exact coordinates.

## Verification

Run app checks:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npx expo-doctor
npx expo export --platform android
```

Run local database/RLS tests when Docker is available:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

Run Edge Function unit tests when Deno is installed:

```bash
deno test supabase/functions/send-sos-notifications/authorization_test.ts
deno test supabase/functions/process-incident-escalations/authorization_test.ts
```

The Jest suite covers authentication, guardian lifecycle, idempotent incident creation/resolution, SOS transition locking, assignment, location throttling, active-incident-only offline replay, acknowledgements, Realtime callbacks, notification denial, authorization helpers, background configuration, SMS routing/text honesty, escalation authorization/timing, responder restrictions, dialer sanitization, RLS safeguards, native-protection schema isolation, and native-owned physical five-click handling.

## Production checklist

Before anything beyond a hackathon demonstration:

- Obtain legal, privacy, security, and emergency-response review.
- Add verified account deletion/export, retention controls, observability, rate limits, abuse controls, and secret rotation.
- Verify Twilio country rules, consent, sender registration, costs, status callbacks, and delivery receipts.
- Add Expo push receipt processing/retries and monitor invalid credentials.
- Perform Android OEM/background/battery tests across supported devices and OS versions.
- Complete accessibility, localization, Play policy/data-safety, release signing, and penetration testing.
- Keep responder features simulated unless a confirmed official integration, operational process, and truthful delivery state exist.

## Primary references

- Expo SDK 57: https://docs.expo.dev/versions/v57.0.0/
- Expo Location: https://docs.expo.dev/versions/v57.0.0/sdk/location/
- Expo TaskManager: https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/
- Expo Notifications: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- Android Accessibility services: https://developer.android.com/guide/topics/ui/accessibility/service
- Android `AccessibilityService.onKeyEvent`: https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#onKeyEvent(android.view.KeyEvent)
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase Edge Function authorization: https://supabase.com/docs/guides/functions/auth
- Supabase `pg_net` and Cron: https://supabase.com/docs/guides/database/extensions/pg_net
- Twilio Messages API: https://www.twilio.com/docs/messaging/api
>>>>>>> 4e0d730 (Implement core alert app updates)
