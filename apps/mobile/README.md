# HunarPramaan phone app (`apps/mobile`)

The Android app, as an Expo **development build** (ADR 002), not Expo Go. Sprint 0 builds the walking skeleton of gate G1: a worker speaks Hindi offline, confirms the transcript, the declaration is saved to the encrypted local database and its outbox, and it syncs to the API when there is signal.

## What is in it

| Screen | What it does | Events |
|---|---|---|
| Sign in (**temporary**) | Development only: `/v1/auth/otp` and `/v1/auth/login` as the seeded mobiliser, then `POST /v1/devices` binds the phone. Replaced in Sprint 1 by workflows 4.3 | none |
| Home | The sync line with the pending count, "add a worker", the workers on this phone; sign-out is blocked while anything is unsynced | none |
| New worker | Name, number and language, typed or filled by the **voice assistant**: it asks for each field, reads the form back and saves only after "हाँ" (`packages/voice` parses spoken digits and yes or no) | `worker.registered` |
| Consent (W2) | The notice plays aloud in the worker's language; `readAloud` is true only when it was read to the end | `consent.given` |
| Interview (W4) | Five questions, each read aloud; tap the mic, speak, confirm or correct the transcript (FR-02); "I haven't done this"; type instead | `declaration.recorded` (`source: 'vosk'`, both `asrTranscript` and `transcript`) |
| Done | The provisional keyword match (`packages/mapping` with `packages/scoring`) as a yellow AI hint, coverage against the 70% line and the suggested route | `mapping.suggested` (actor `device-mapper`, engine `device_keyword`) |

Behind the screens:

- **Storage (ADR 003):** `expo-sqlite` with SQLCipher, through Drizzle (`src/db/schema.ts`, migrations in `drizzle/`). A random 256-bit key lives in `expo-secure-store` (Android Keystore). The app refuses to start if a build lacks SQLCipher.
- **Outbox:** every write goes to its table and, in the same transaction, to `outbox` as an event sealed into this device's hash chain with `seal()` from `@hunarpramaan/audit`. It is checked against the `SyncEvent` contract and `AUTHORITY` first, so a bad event never enters the outbox. UUIDv7 event ids. Triggers make every table insert-only (rule 4); delivery is an `outbox_acks` row.
- **Sync:** `src/core/sync.ts` pushes the outbox to `POST /v1/sync/push` in `seq` order, in batches; `src/core/sync-loop.ts` runs it after each write, when the network or the app comes back, and backs off after failures (2 s doubling to 5 min, half random). A rejected event or an expired sign-in stops the loop and says so.
- **Speech:** `react-native-vosk` with `vosk-model-small-hi-0.22`, on the phone. Audio is never stored or sent. The model is unloaded when a screen is done with it, to free memory.

The pure parts (outbox sealing and ordering, sync, back-off, the voice-form logic, the matcher) have Vitest tests that run on sql.js, the same SQLite schema compiled to WebAssembly.

## Run it on the phone

You need Android Studio with JDK 17, a USB cable and the 3 GB target phone. The laptop and the phone must be on the same Wi-Fi.

1. **Install Android Studio** from developer.android.com, and in its SDK Manager install the Android SDK Platform the build asks for (API 37) and the Platform Tools. Install **JDK 17** (Temurin, or Android Studio's bundled JDK). Then set:

   | OS | Settings |
   |---|---|
   | Windows | `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`, `JAVA_HOME` = your JDK 17 folder; add `%ANDROID_HOME%\platform-tools` to `Path` |
   | macOS | `export ANDROID_HOME=$HOME/Library/Android/sdk`, `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`, add `$ANDROID_HOME/platform-tools` to `PATH` |
   | Linux | `export ANDROID_HOME=$HOME/Android/Sdk`, `JAVA_HOME` = your JDK 17, add `$ANDROID_HOME/platform-tools` to `PATH` |

2. **Install and download the speech model** (about 44 MB, checked against its SHA-256, unpacked into the git-ignored `assets/model-hi`):

   ```bash
   pnpm install
   pnpm --filter @hunarpramaan/mobile model:download
   ```

3. **Start the API on the laptop** with demo data: `pnpm db:seed`, then `pnpm dev`. Find the laptop's LAN address (`ipconfig` on Windows, `ipconfig getifaddr en0` on macOS, `hostname -I` on Linux). On Windows, allow Node.js through the firewall on private networks when asked.

4. **Point the app at it:** create `apps/mobile/.env` with your address, for example:

   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
   ```

   It is read when the app is bundled, so restart the build after changing it. Without it the app uses `http://10.0.2.2:4000`, the emulator's address for the host. Plain HTTP works only in debug builds.

5. **Connect the phone:** turn on Developer options and USB debugging, plug it in and accept the prompt. `adb devices` must list it.

6. **Build and run:**

   ```bash
   pnpm --filter @hunarpramaan/mobile android
   ```

   The first build takes 10 to 20 minutes. It installs the debug app and starts Metro. To build only for the phone's CPU, which is faster and smaller, add `-- --device` to choose the phone, or set `reactNativeArchitectures=arm64-v8a` in `android/gradle.properties` after the first prebuild (`armeabi-v7a` for older 32-bit phones).

7. **Walk through it:** sign in with `9000000001`, tap "send code" (the code fills itself) and enter PIN `1234`. Add a worker by voice or by typing, agree to consent, answer the questions and confirm. The sync line turns green with "सब सिंक है" once the API has stored everything.

8. **Airplane-mode drill (E2E-02):** turn on airplane mode, add another worker and finish the interview. The sync line shows the pending count ("5 बाकी"). Turn airplane mode off: it syncs by itself and turns green. The API log shows `POST /v1/sync/push 200`.

The dashboard lists synced declarations once `feat/api-declarations-read` is merged; on `main` the web app has no declarations page yet.

### Commands

| Command | What it does |
|---|---|
| `pnpm --filter @hunarpramaan/mobile android` | Build the dev build, install it on the phone or emulator and start Metro (`expo run:android`) |
| `pnpm --filter @hunarpramaan/mobile start` | Only Metro, for a dev build that is already installed |
| `pnpm --filter @hunarpramaan/mobile model:download` | Download the Vosk Hindi model into `assets/model-hi` and check its SHA-256 (`--force` to redo) |
| `pnpm --filter @hunarpramaan/mobile expo:prebuild` | Generate `android/` without building (it is git-ignored) |
| `pnpm --filter @hunarpramaan/mobile db:generate` | A new local migration from `src/db/schema.ts`; then `pnpm format` |
| `pnpm --filter @hunarpramaan/mobile test` | The Vitest tests |

## What was checked, and what was not

Checked on the development laptop (Windows, no JDK or device):

- `pnpm check` passes for the whole repo; the app's typecheck covers every screen.
- `expo prebuild --platform android` succeeds, and the generated project has `expo.sqlite.useSQLCipher=true`, `Vosk_models=assets/model-hi`, the microphone permission, `allowBackup="false"` and cleartext HTTP in the debug manifest only.
- The model script downloads, checks the hash (a wrong hash is refused and the file deleted), unpacks, and does nothing on a second run.

**Not checked:** a native build (`gradlew`), the app on the emulator or the 3 GB phone, Vosk's accuracy, and SQLCipher at runtime. Those need Android Studio and the phone, and they are the spike risks below.

## Spike risks

These have to be proven on the 3 GB target phone before G1 (25 Oct):

1. **`react-native-vosk` on Expo SDK 58.** Version 2.1.7 (November 2025) was built against React Native 0.81 and Android Gradle Plugin 8.7; SDK 58 uses React Native 0.88, AGP 9.2.1, Gradle 9.4.1 and Kotlin 2.2. Expo's template sets `android.builtInKotlin=false` and `android.newDsl=false`, which keeps older libraries building, but this has not been compiled yet. If it fails: patch the library's `build.gradle` with `pnpm patch react-native-vosk` (drop its `buildscript` AGP classpath, `lintOptions` becomes `lint`), or move the app to Expo SDK 55 (React Native 0.83).
2. **Vosk, SQLCipher, the camera and the safety-gear detector in one build** (ADR 002). This build has Vosk and SQLCipher; the camera and the detector are not in it yet. Their native libraries can clash (for example two copies of `libc++_shared.so`), which needs `packagingOptions { pickFirst }` through a config plugin. Add `expo-camera` and a TFLite model to this build as the next spike step. The fallback stays ADR 002's: run the safety-gear check on the server after sync (the `feat/ai-safety-gear` branch does that).
3. **Memory on 3 GB.** The small Hindi model is 82 MB on disk (`Gr.fst` 31 MB, `HCLr.fst` 25 MB, `final.mdl` 16 MB, the i-vector extractor 10 MB) and most of it is loaded while listening, on top of React Native, Hermes and the camera later. The app unloads the model when the interview or form screen closes. Measure with `adb shell dumpsys meminfo in.hunarpramaan.app` during an interview, with the camera open once it is added.
4. **Storage and first launch.** The model ships inside the app (about 44 MB compressed) and Vosk copies it to internal storage on first use (another 82 MB), which takes a few seconds on a slow phone; the screen says "preparing". A debug build for all four CPU types is large: build for the phone's CPU only.
5. **Hindi speech quality.** The small model's vocabulary may write trade words oddly, for example MCB as "एमसीबी" or as separate letters. The worker confirms or corrects every answer, and the matcher compares consonant skeletons to absorb spelling differences. Measure the transcript-correction rate in the pilot.
6. **Read-aloud needs a Hindi voice.** Android's text-to-speech works offline only when the phone has the Hindi voice installed. Without it, consent shows "read the notice out" and records `readAloud: false`.
7. **Temporary sign-in.** The token lasts 12 hours (`JWT_TTL_HOURS`). After that, sync stops with "sign in again" and the work waits in the outbox; the home screen's button then signs out so the same account can sign in and send it. Only that account can: the server accepts events from the account that made them. The Sprint 1 sign-in renews the token in the background (workflows 4.4).

## Not built yet

The interview's picture cards and "finish later" (W4), the full match-result screen (W5), downloading newer trade packs, the assessor's screens, `pnpm e2e:mobile` (Maestro), and moving the interview questions into the trade pack (`src/core/questions.ts` explains why they are here).
