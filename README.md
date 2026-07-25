<p align="center">
  <img src="./assets/images/core-alert-logo.jpeg" alt="Core Alert logo" width="180" />
</p>

<h1 align="center">Core Alert</h1>

<p align="center"><strong>Every Second Counts.</strong></p>

<p align="center">
  An Android-first personal safety application for alerting trusted guardians,
  sharing an active incident, and coordinating a response.
</p>

Core Alert is a hackathon prototype built around a simple emergency flow: a protected user starts an SOS manually or with five volume-down presses, confirms it through a short countdown, and creates a cloud-backed incident. Assigned guardians can then receive the alert, follow location updates, review available evidence clips, and acknowledge whether they are responding.

> [!CAUTION]
> Core Alert is not an emergency-service integration and does not automatically contact police, ambulance, fire, or other public responders. The emergency-call action opens the Android dialer only. The responder dashboard is explicitly labelled as a hackathon simulation. Notification delivery, location availability, background execution, and evidence capture are not guaranteed.

## Project status

| Area | Current state |
| --- | --- |
| Product stage | Functional Android-first hackathon prototype |
| Client | React Native 0.86 and Expo SDK 57 with a custom native Android project |
| Native safety engine | Kotlin accessibility, countdown, lifecycle, location, evidence, and WorkManager components |
| Backend | Supabase Auth, Postgres, Realtime, Storage, Row Level Security, RPCs, and Edge Functions |
| Distribution | Local Android and EAS profiles exist; production signing and store release are not complete |
| Expo Go | Not supported; the app depends on custom native Android code |

## Capability matrix

### Implemented in the repository

| Capability | What is implemented |
| --- | --- |
| Authentication | Supabase email/password sign-up, sign-in, password reset, session restoration, and sign-out |
| Emergency profile | Protected-user profile with contact and medical context, backed by Supabase with local restoration support |
| Guardian linking | Invite codes, incoming requests, accept/decline, linked-account and contact-only guardians, primary-guardian selection, and removal |
| Manual and demo SOS | Manual activation, cancelable countdown, cloud incident creation, and a clearly identified Demo SOS mode |
| Five-press shortcut | A narrowly scoped Android `AccessibilityService` counts five separate volume-down presses within three seconds using one native sequence manager |
| Closed-UI activation | A pending native activation store and lock-screen countdown activity can start the flow without depending on the React Native UI being alive |
| Incident consistency | Persisted lifecycle states, UUID activation IDs, idempotent create/restore and resolve RPCs, and database protection against duplicate active incidents |
| Live location | Active-incident foreground/background location updates, local retry queue, incident history, and guardian map/directions access |
| Guardian response | Incident view, responding/cannot-respond actions, call/message handoff, delivery status, and Supabase Realtime updates |
| Evidence capture | Native CameraX MP4 video with microphone audio, native AAC/M4A fallback, private app storage, foreground disclosure, and WorkManager uploads |
| Evidence access | Private Supabase Storage, evidence metadata, Realtime updates, and short-lived signed links for the owner and assigned guardians |
| Incident resolution | Idempotent resolution, service and notification cleanup, local-state reset, and active-incident restoration after app restart |
| Activity and diagnostics | Incident history, incident details, lifecycle diagnostics, shortcut diagnostics, permission state, and recoverable warnings |
| Responder simulation | Demo-only responder dashboard labelled **HACKATHON SIMULATION** with no police connection or dispatch claim |

### Implemented but dependent on external configuration

| Capability | Current limitation |
| --- | --- |
| Guardian push notifications | Token registration, guardian-only loud Android channel, vibration, actions, Edge Function delivery, and delivery records exist. This checkout does not include Firebase Android client configuration or an FCM v1 service-account credential, so out-of-app Android push should not be expected from a clean build until those are configured. |
| SMS fallback | Secure server-side Twilio integration exists and is disabled by default. It requires provider credentials, an approved sending number, deployment secrets, and `SMS_FALLBACK_ENABLED=true`. |
| No-response escalation | The escalation Edge Function and cron setup template exist. They require deployed functions, a shared cron secret, and a configured Supabase Cron/`pg_net` job. |
| Background shortcut reliability | The accessibility implementation does not require JavaScript, but Android and manufacturer power policies may still stop or restrict it. The user must enable the service manually. |
| Camera and microphone evidence | Recording requires explicit permissions and a visible countdown activity before the foreground service starts. Camera, microphone, storage, or operating-system restrictions can make evidence unavailable without cancelling the SOS. |
| APK/release delivery | EAS profiles and Gradle release output exist, but the current release variant uses the debug signing configuration and is not suitable for Play Store production. |

### Not implemented

- Automatic police, ambulance, fire, or government emergency dispatch
- Continuous live camera or live-audio streaming; guardians receive completed near-live evidence segments
- Guaranteed push, SMS, Realtime, location, background-service, or evidence delivery
- Operation after Android **Force stop**
- Full native iOS parity for the hardware shortcut and Android foreground services
- Expo push-receipt reconciliation and provider delivery callbacks
- Production Play Store signing, compliance review, and release hardening

## Emergency lifecycle

Core Alert uses one persisted lifecycle rather than allowing screens and services to independently decide whether an SOS is active:

```text
IDLE
  → COUNTDOWN
  → ACTIVATING
  → ACTIVE
  → ENDING
  → RESOLVED
  → IDLE
```

Activation and ending can move to explicit failure states when a critical cloud operation cannot be confirmed. Secondary failures—such as a location update, guardian delivery, or evidence start failure—are recorded without creating a second incident or silently returning the user to `IDLE`.

The native and database layers use the same activation UUID to make retries safe. Supabase migrations add a unique activation identifier and a partial unique index that permits at most one active incident per protected user.

## Five-volume-down shortcut

The physical shortcut is implemented entirely in native Android code:

1. The user enables Protection Mode and manually grants the Core Alert Accessibility permission.
2. `CoreAlertAccessibilityService` receives volume key events without inspecting screen content.
3. `CoreAlertVolumeSequenceManager` counts only non-repeated `ACTION_DOWN` events for volume down.
4. Five presses within three seconds create one pending activation with a 60-second expiry.
5. The native emergency countdown activity opens, including over the lock screen where the device permits.
6. Countdown completion hands the activation to the central SOS coordinator.
7. The coordinator creates or restores one Supabase incident and starts incident services.

The shortcut is designed for the app being open, backgrounded, or removed from recents, and for a locked screen where Android permits it. It cannot work after a manual **Force stop**, when Accessibility is disabled, when protection is disabled, or when the operating system/OEM terminates the service.

## Guardian alerts

The sender and guardian use separate notification behavior:

- The protected user's activation and foreground-service notifications are silent status notifications, with an optional short haptic confirmation.
- A linked guardian's incoming SOS uses the dedicated high-importance guardian channel with sound, vibration, heads-up presentation, public lock-screen visibility, and response actions.
- Notification actions can mark the guardian as responding or unable to respond, or open the live-location view.
- Delivery attempts and acknowledgements are stored in Supabase and exposed through Realtime.

The application path is present, but remote Android delivery still requires the external FCM configuration described in [External service setup](#external-service-setup).

## Evidence model

Evidence recording is native and does not depend on the JavaScript runtime remaining alive.

1. After the visible countdown completes, Android starts the evidence foreground service.
2. CameraX records MP4 video with its own microphone track when both permissions and hardware are available.
3. If video cannot start, native `MediaRecorder` falls back to AAC audio in an M4A/MP4 container.
4. Completed short segments—currently 30 seconds—are written to private app storage.
5. Unique WorkManager jobs upload files to the private `incident-evidence` Supabase Storage bucket.
6. The owner and guardians assigned to that incident can request short-lived signed URLs.
7. A local segment is deleted only after the server confirms the completed upload.

Core Alert never attempts to run two microphone recorders at once, never starts recording without runtime permission, and keeps the SOS active if evidence capture fails. Evidence is near-live segmented media, not a continuous video call or live microphone feed.

## Architecture

| Layer | Responsibility |
| --- | --- |
| React Native / Expo Router | Authentication, onboarding, profile, guardian management, incident screens, diagnostics, and normal application navigation |
| App contexts and services | Session restoration, lifecycle coordination, incident API calls, Realtime subscriptions, notification handling, location queueing, and UI state |
| Native Android / Kotlin | Physical shortcut, pending activation, lock-screen countdown, foreground protection, native activation, active location, evidence recording, secure device credentials, and upload scheduling |
| Supabase Postgres | Profiles, guardian relationships, incidents, assignments, locations, delivery attempts, acknowledgements, escalation events, device registrations, and evidence metadata |
| Supabase Realtime | Incident state, locations, guardian acknowledgements, notification delivery, assignments, and evidence availability |
| Supabase Storage | Private incident evidence objects with policy-controlled access |
| Supabase Edge Functions | Authenticated notification delivery, native-device activation, native protection credentials, native evidence upload authorization, and scheduled escalation |

### Repository layout

```text
app/                         Expo Router screens and routes
components/                  Shared interface components
store/                       Authentication, app, and SOS contexts
services/                    Supabase, incident, guardian, location,
                             notification, hardware, and lifecycle services
modules/core-alert-hardware/ React Native bridge for native diagnostics/state
android/                     Native Android app, services, activities, and workers
supabase/migrations/         Database schema, RLS, RPC, Realtime, and Storage changes
supabase/functions/          Edge Functions and shared delivery logic
supabase/templates/          Optional escalation scheduler template
supabase/tests/              Database policy tests
assets/                      Logo, icons, fonts, and splash assets
```

## Security and privacy

- Supabase Row Level Security limits incident, location, delivery, acknowledgement, and evidence access to the protected user and assigned guardians.
- Evidence uses a private Storage bucket; clients access objects through expiring signed URLs rather than public object URLs.
- Native protection credentials are encrypted with Android Keystore on the device, and only hashes are stored server-side.
- The Supabase service-role key and SMS provider credentials belong only in Edge Function secrets.
- The mobile client uses the public Supabase URL and anon/publishable key from an untracked local environment file.
- Camera, microphone, notification, accessibility, and location permissions are requested explicitly.
- Active native recording and location work use foreground-service disclosure notifications.
- Accessibility handling is restricted to hardware key events and does not inspect or store screen content.
- An SOS may continue when evidence or a secondary delivery channel fails; the app does not present that failure as successful delivery.

## Prerequisites

- macOS, Linux, or Windows with Node.js/npm compatible with Expo SDK 57
- Android Studio and Android SDK 36
- JDK 17 or newer
- An Android device or emulator
- A Supabase project and the Supabase CLI
- Deno for the standalone Edge Function authorization tests
- Optional: an Expo/EAS account for cloud builds
- Optional: Firebase/FCM credentials for real Android push delivery
- Optional: Twilio credentials for SMS fallback

Use the [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/) for version-specific tooling guidance.

## Local setup

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure the public mobile environment

```bash
cp .env.example .env.local
```

Set the following values in `.env.local`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-public-anon-or-publishable-key>
```

Do not place the Supabase service-role key, FCM service-account key, Twilio credentials, or cron secret in a client environment variable or commit them to Git.

### 3. Configure Java and Android

Point `JAVA_HOME` to a JDK 17+ installation and `ANDROID_HOME` to Android SDK 36:

```bash
export JAVA_HOME="<path-to-jdk-17-or-newer>"
export ANDROID_HOME="<path-to-android-sdk>"
```

### 4. Apply the Supabase backend

Authenticate and link the local project without committing project-specific credentials:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy
```

The migrations create the database tables, RLS policies, RPCs, Realtime publications, uniqueness protections, evidence metadata, and private Storage bucket used by the app.

### 5. Run the Android app

This project requires a native development build; it does not run in Expo Go.

```bash
npm run android
```

To work directly with Gradle:

```bash
cd android
./gradlew assembleDebug
```

For a debug build that connects to Metro:

```bash
npm start -- --dev-client
```

> [!WARNING]
> At the audited revision, `app.json` contains an invalid adaptive-icon foreground reference ending in `.pngcommit`; the actual repository asset ends in `.png`. Expo config-driven commands may fail until that reference is corrected. This documentation-only update intentionally leaves application configuration unchanged.

## External service setup

### Android push notifications

Core Alert registers Expo push tokens and sends guardian payloads through the Expo Push API. On Android, the final delivery path still depends on Firebase Cloud Messaging.

The current checkout does **not** include:

- Firebase Android client configuration for the application package
- An FCM v1 service-account credential in the EAS/build environment

Configure both securely for the chosen native/EAS build pipeline before testing out-of-app guardian alerts. Never commit a service-account JSON file. Reinstall the app or clear its data when validating notification-channel changes because Android channel sound and importance settings are persistent.

See the [Expo SDK 57 notifications guide](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) for the version-matched setup.

### SMS fallback

Copy the server-only example to the ignored local function environment file:

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

Configure the `SMS_FALLBACK_ENABLED` and `TWILIO_*` variables in that untracked file, then store them as Supabase Edge Function secrets:

```bash
supabase secrets set --env-file supabase/functions/.env
```

SMS behavior is optional and subject to the provider account, regional rules, recipient consent, sender approval, and carrier delivery.

### No-response escalation

`process-incident-escalations` can retry guardian delivery for active incidents without a responding acknowledgement. Configure a strong `ESCALATION_CRON_SECRET` as an Edge Function secret and use `supabase/templates/setup_escalation_cron.sql` as a reviewed template for Supabase Cron and `pg_net`.

Do not commit the cron secret or a private project URL into the template.

## Android activation checklist

After installing a native build on a physical Android device:

1. Sign in and complete the emergency profile.
2. Link at least one guardian account.
3. Enable Protection Mode in Core Alert.
4. Enable the Core Alert Accessibility service in Android Settings.
5. Allow notifications and the required location permissions.
6. Allow camera and microphone permissions if evidence is required.
7. Exclude Core Alert from aggressive battery optimization where the device offers that option.
8. Test manual SOS first, then test five separate volume-down presses within three seconds.

Do not validate the shortcut after using Android Settings → Apps → Core Alert → **Force stop**; Android intentionally blocks the app until the user launches it again.

## Verification

### Static and unit checks

```bash
npm run lint
npm run typecheck
npm test
```

The Jest suite covers core services, lifecycle idempotency, notification behavior, the hardware-trigger adapter, and migration expectations.

### Supabase policy and function checks

With a local Supabase stack running:

```bash
supabase test db
```

Run the Edge Function authorization tests with Deno:

```bash
deno test \
  supabase/functions/send-sos-notifications/authorization_test.ts \
  supabase/functions/process-incident-escalations/authorization_test.ts
```

### Manual two-device validation

Automated tests do not prove physical-device delivery. Before a demo or release, use separate protected-user and guardian devices to verify:

- exactly one incident is created for one manual or hardware trigger;
- the sender sees immediate local activation status without a loud guardian ringtone;
- the guardian receives the out-of-app, lock-screen alert with sound and vibration;
- notification actions update the incident acknowledgement;
- location updates appear only for the owner and assigned guardian;
- completed evidence segments become available through expiring links;
- resolving an incident stops incident-only services and clears the active notification;
- Protection Mode remains enabled after an individual SOS ends, when configured;
- app restart and temporary loss of connectivity restore one active incident without duplicate delivery.

## Known limitations

- Remote guardian push is not ready in a clean checkout until Firebase Android configuration and FCM v1 credentials are supplied.
- The committed adaptive-icon path in `app.json` currently contains a typo.
- Accessibility and foreground-service behavior varies by Android version and device manufacturer.
- Android manual **Force stop** disables the closed-app trigger until the app is opened again.
- Evidence appears as completed short segments, not a continuous live stream.
- Camera, microphone, background location, and notifications are permission- and policy-dependent.
- Expo Push API ticket acceptance does not prove final device delivery; push-receipt reconciliation is not implemented.
- Twilio delivery-status callbacks are not implemented.
- The current Gradle release build uses debug signing.
- The native emergency features have not been implemented for iOS.
- The project remains dependent on network connectivity and correctly deployed Supabase services for cloud incident coordination.

## Technology

- React Native 0.86
- Expo SDK 57 and Expo Router
- TypeScript
- Kotlin and native Android services
- CameraX and `MediaRecorder`
- Android WorkManager
- Expo Location, TaskManager, and Notifications
- Supabase Auth, Postgres, Realtime, Storage, RPCs, and Edge Functions
- Jest and pgTAP

## Safety statement

Core Alert helps communicate an emergency to trusted guardians; it is not a substitute for local emergency services, professional safety equipment, or an official responder system. A sent request, accepted push ticket, queued SMS, displayed map, or opened dialer does not prove that another person or service received or acted on the emergency.

For Demo SOS incidents, all responder activity is simulated for hackathon presentation. The app must never be represented as having notified police unless an official integration is added and independently confirmed.

## License

See [LICENSE](./LICENSE) for the license text included with this repository.
