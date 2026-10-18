# 012. Sign-up and sign-in by voice, in Hindi

- **Status:** Proposed
- **Date:** 2026-10-18
- **Requirements:** FR-01, FR-05, FR-10, NFR-01, NFR-04, NFR-05, NFR-06, NFR-09; rules 1, 2, 7 and 8 in `CLAUDE.md`

## Context

Many workers, and some mobilisers, find typing a 10-digit number on a small screen hard, and some
can't read the screen at all (NFR-06). The team wants people to sign up and sign in by speaking
Hindi. Today only staff have accounts, opened with an SMS code and a PIN; workers are registered by
a mobiliser and never sign in. The phone app starts in Sprint 1, with Vosk's small Hindi model on
the phone.

"Sign in by voice" can mean two things: speaking instead of typing, or being recognised by your
voice (a voiceprint). Only the first is safe enough for an app that certifies people.

The full workflow, screen by screen, is in [`docs/design/workflows.md`](../design/workflows.md).

## Decision

1. **Voice is an input, not a key.** People can say their mobile number, the SMS code, an invite
   code, their name, and yes or no. What lets them in doesn't change: the SMS code, the PIN and,
   for field roles, the registered phone.
2. **Recognition runs only on the phone**, with Vosk and a short word list on sign-in screens:
   digits, the numbers 10 to 99, "डबल", "ट्रिपल", yes, no and a few commands. Sign-in audio is
   never stored, logged or uploaded. Bhashini is not used for sign-in.
3. **The PIN is never spoken.** It's pressed on a keypad. The app gives spoken cues but never reads
   the PIN back.
4. **No voiceprints.** We don't build, store or compare speaker models.
5. **Every voice step has a tap alternative on the same screen**, and two misses open the keypad.
6. **One way in on the phone.** Number, then SMS code; only then does the server say whether the
   number has an account, so asking for a code still reveals nothing. An existing account asks for
   the PIN. A new number on the worker side creates a worker account. Staff accounts are never
   created this way: they come from invites (ADR 010).
7. **Workers may start on their own phone.** They give consent, answer the interview offline and
   see the AI's suggestion, then save it by signing up. The account stays unverified until a
   mobiliser checks identity (eKYC) and decides the route. Nothing is assessed before that.
8. **Returning users unlock with the PIN, or Android's fingerprint or face check**, with no
   internet. A renewal key tied to the phone renews the 12-hour sign-in when online. It stops
   working after 30 days without a sync, a PIN reset, a revoked phone or a deactivated account.
9. **The web app has no voice sign-in.** Browser speech recognition usually sends audio to a cloud
   service, and rule 8 lets only transcripts leave our servers.

## Alternatives we rejected

- **Voiceprint sign-in (speaker verification).** A recording or a cloned voice can fool it, and a
  phone can't reliably check offline that a live person is speaking. Noise, a cold or a shared
  phone would lock out the people we serve. A voiceprint is biometric data that can't be changed
  after a leak, and Android offers apps no secure voice check like the one it has for fingerprints
  and faces (BiometricPrompt).
- **Cloud speech for sign-in (Bhashini or a browser service).** It needs a network, and it sends
  audio of personal data off the phone.
- **SMS code only, with no PIN.** A swapped or shared SIM would open the account, and every sign-in
  would need a network.
- **Aadhaar OTP or face authentication to sign in.** Out of scope for the pilot, where eKYC is
  mocked, and it would bring Aadhaar rules into every sign-in.

## Consequences

- New API calls, all additive: check a code on its own, create a worker account, renew a sign-in,
  and change or reset a PIN. They're listed in the workflow document, section 15.
- Contract changes (rule 9): `worker` may perform `worker.registered` (signing up) and
  `device.registered`, and `consent.given` records whether consent was given by tap or by voice.
  They should land with ADR 010's and ADR 011's changes before v1 freezes on 25 Oct, or wait for v2.
- ADR 010 must say which organisation holds a worker who signed up alone, before a mobiliser
  verifies them.
- The Vosk Hindi model ships inside the app, so voice works on the first launch with no internet.
  Sign-in prompts are recorded by a native speaker, with recorded digits for read-back, so phones
  without a Hindi text-to-speech voice still work.
- The Sprint 1 spike checks Vosk's word-list mode with the Hindi model on the 3 GB phone. The
  Sprint 2 usability test measures how often numbers are heard right, against a target of 95%
  within two tries in a quiet room.
- New tests: a Maestro run of voice sign-up followed by airplane mode, and integration tests for
  code limits and for a renewal key refused after the phone is revoked.
