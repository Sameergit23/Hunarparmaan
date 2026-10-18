# The phone app (`apps/mobile`)

The Android app for workers, mobilisers and assessors. It is built with Expo (React Native) as a
development build (ADR 002), stores everything on the phone first (ADR 003), and previews in a
browser for quick work on a laptop. Read [`wire-code.md`](wire-code.md) before changing a screen.

## Who uses it

Workers usually have no login: **the mobiliser's phone acts with them** (`docs/design/access-control.md`).
The mobiliser signs in on the phone, registers the worker, and hands the phone to the worker for
consent and the interview. Those events carry the mobiliser as actor, which `AUTHORITY` allows
(`consent.given`, `declaration.recorded`).

| Person | Signs in | Language first | Screens |
|---|---|---|---|
| Worker | No; uses the mobiliser's phone | Hindi | Landing, consent, Apna Anubhav interview, match result, worker home, help |
| Mobiliser | OTP + PIN | Hindi | Workers on this phone, register a worker, route decision |
| Assessor | OTP + PIN | English | Assessor home, start session, calibration, evidence capture, scoring, review and sign |
| Master assessor | OTP + PIN | English | Blind re-score queue (later; the web has none) |

## Flows

1. **Landing.** Language (हिंदी, English), then "मैं कारीगर हूँ" or "मैं असेसर या मोबिलाइज़र हूँ", each
   with a speaker button. Offline note at the bottom.
2. **Sign in** (staff). Phone number, then the one-time code (shown on screen in demo mode), then
   the PIN. The first sign-in needs the network; after that the session is kept on the phone for
   offline work, and sync asks for a new sign-in only when the token has expired.
3. **Mobiliser: register a worker.** Name, language, eKYC reference (mocked; never an Aadhaar
   number: `EkycRef` refuses one), optional phone. Then:
   - **Consent:** the notice in the worker's language, read aloud. "हाँ, मैं सहमत हूँ" or "नहीं".
   - **Interview (Apna Anubhav):** one question per NOS, read aloud. The worker touches picture
     choices for the tasks they have done and speaks. The transcript is shown to confirm or change
     (FR-02).
   - **Match result:** on the phone, a keyword match gives a provisional coverage per QP with
     `packages/scoring`. The AI hint says "यह AI का सुझाव है। मोबिलाइज़र जाँचकर पक्का करेंगे।"
     (FR-03). The mobiliser confirms the route or changes it with a reason (FR-04).
   - **Worker home:** journey, next step and the match summary, with the worker's ID to show the
     assessor.
4. **Assessor: a session.**
   - **Home:** sync status with the pending count, trade-pack version, calibration status and the
     sessions on this phone.
   - **Start:** pick a worker on this phone or enter their ID; then the eKYC reference, a start
     photo and GPS (FR-05).
   - **Calibration:** 3 reference clips scored against the master's scores (FR-07). The draft pack
     has no clips yet, so the screen says so and lets the assessor continue.
   - **Each criterion:** capture one clip (30 to 60 s, or a photo where the pack says so), hashed
     with SHA-256 at capture (rule 5). Then **scoring**: 0/1/2 plates with the rubric line, the AI
     hint from the on-phone detector beside it, and a required reason when the score conflicts
     with a raised hint (FR-08).
   - **Review and sign:** the result against the pass rule with `qpResult` from `packages/scoring`,
     NOS bars, evidence checks, then the PIN and "Sign result" (FR-09).

## Code layout

```text
apps/mobile/
├── app.json               # Expo config (expo-router)
├── metro.config.js        # monorepo support for the shared packages
└── src/
    ├── app/               # expo-router screens
    │   ├── index.tsx      # landing
    │   ├── sign-in.tsx
    │   ├── worker/        # consent, interview, match, home, help
    │   ├── mobiliser/     # workers, register, route
    │   └── assessor/      # home, start, calibrate, capture, score, sign
    ├── theme/             # one theme file built from docs/design/tokens.json
    ├── components/        # Wire code components (see below)
    ├── i18n/              # en.ts and hi.ts; hi is typed against en
    ├── data/              # local store, outbox, device chain, sync client
    ├── domain/            # pure logic: event builders, keyword mapping, session state
    └── platform/          # native parts behind interfaces: speech, camera, detector, location
```

Components follow `wire-code.md`: `BrandStripe`, `LogoTile`, `Button` (primary and secondary,
54 px for workers), `SpeakerButton`, `AiHint`, `Chip`, `Card` and `CardHeader`, `JourneyBar`,
`CoverageBar`, `ScorePlates`, `BottomNav`, `ScreenHeader`. Colours, fonts and sizes come only from
`src/theme`, which is built from `docs/design/tokens.json`. Icons are `lucide-react-native` with
square caps and mitred joins.

## Offline data (ADR 003)

- **`LocalStore`** keeps records and the outbox. Every write goes to its record and to the outbox
  in one step, as a sync event built with `packages/contracts` and sealed into the device's hash
  chain with `seal()` from `packages/audit`.
  - On the phone: `expo-sqlite` with SQLCipher. The key is generated once and kept in
    `expo-secure-store`.
  - In the browser preview: IndexedDB. It is for development only, not for real data.
  - In tests: memory.
- **Clips** stay as files on the phone (`expo-file-system`) and in IndexedDB in the browser. Only
  their SHA-256, size and type go in the event.
- **Device id and chain head** are created once per install and kept in the store.
- **Sync** (`data/sync.ts`) runs when there is a network and a valid sign-in:
  1. register the device (`POST /v1/devices`) the first time;
  2. push the outbox in order, up to 100 events at a time (`POST /v1/sync/push`), and drop events
     the server stored or already had;
  3. upload each clip the server asks for (to its `uploads` URL, or `PUT /v1/evidence/:id/content`),
     then `POST /v1/evidence/:id/complete`;
  4. pull (`GET /v1/sync/pull`) for trade-pack updates and the server's clip checks.

  A rejected event stays visible, with the server's reason, instead of being dropped silently.
  Failures back off (2 s, 4 s, 8 s and so on, up to 5 min). The pending count on the assessor home
  is the outbox's size.
- **Trade pack.** The latest pack is downloaded on sync and kept. A copy of the draft electrician
  pack ships with the app, so a fresh install works offline.

## Native parts behind interfaces

The browser preview and the tests use stand-ins; the Android build uses the real modules.

| Interface | Android build | Browser preview |
|---|---|---|
| `Speech` (text to speech) | `expo-speech` | `expo-speech` (Web Speech API) |
| `Recognizer` (speech to text) | `react-native-vosk`, Hindi model in the trade pack (later) | Typed answer; the browser's speech recognition where available |
| `Camera` | `expo-camera` | The browser camera (`getUserMedia`, `MediaRecorder`), or a demo clip |
| `FrameDetector` | MediaPipe hand and pose models (later, ADR 012) | Returns `unavailable` |
| `Location` | `expo-location` | `navigator.geolocation`, or a fixed demo point |

## Running it

```bash
pnpm --filter @hunarpramaan/mobile dev        # browser preview on http://localhost:8081
pnpm --filter @hunarpramaan/mobile android    # Android dev build (Android Studio + JDK 17)
```

The browser preview talks to the API at `EXPO_PUBLIC_API_URL` (default `http://localhost:4000`).
A phone needs your computer's LAN address instead, for example `http://192.168.1.20:4000`.
