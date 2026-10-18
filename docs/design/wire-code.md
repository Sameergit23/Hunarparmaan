# Wire code: HunarPramaan's design language

Wire code takes its colours from the wiring Indian electricians work with every day: red, yellow and blue for the three phases, black for neutral and green for earth. Each colour gets a single job on screen.

- **Values:** [`tokens.json`](tokens.json)
- **Reference screens:** [`screens/`](screens/). GitHub shows HTML as source, so clone the repo and open the files in a browser. Every value in them is the real one; the names, places and numbers are made up.

## Colour has one meaning each

| Token | Hex | Used for | Never for |
|---|---|---|---|
| `ground` | `#E4E5E0` | Screen background (switchboard grey) | Text |
| `plate` | `#FAFAF7` | Cards, inputs, secondary buttons | Text on the ground |
| `ink` | `#000000` | Text, and anything a person does or decides: primary buttons, selections, scores, signatures, the bottom nav | — |
| `ink2` | `#4A4C47` | Secondary text and section labels | Main text on worker screens |
| `line` | `#8E918A` | Quiet borders, steps not done yet (dashed), bars below 70% | Text |
| `divider` | `#D2D4CE` | Dividers, bar tracks, photo placeholders | Borders of things you can tap |
| `phaseYellow` | `#F2B600` | AI hints and suggestions, always with a 2px black border and black text | Buttons, warnings, decoration |
| `earthGreen` | `#2E7D32` | Done, verified, passed, synced, with white text | Primary actions |
| `phaseRed` | `#C8102E` | Errors and the recording dot | Decoration |
| `phaseBlue` | `#1F4E9C` | The brand stripe | Any UI state |
| `navOff` | `#B9BBB4` | Inactive items on the black nav bar | Anything on a light background |

Rules:

- Colour never carries meaning alone. Pair it with an icon and a word, for example "सीधा टेस्ट", "AI hint" or "Signed".
- Every screen starts with the brand stripe: three 4px bands in red, yellow and blue. The logo tile ends with the same stripe.
- No other colours, no gradients and no shadows.
- All text passes WCAG AA contrast. Black on yellow is 11.5:1 and white on green is 5.1:1.

## Type

- **Rajdhani** 700 for headings and big numbers, and 600 for card header strips. It covers Devanagari.
- **Hind** 400, 500 and 600 for all other text, in Hindi and English.
- **Worker screens:** body 16–18px, headings 30–34px, big numbers 38–44px.
- **Assessor screens:** body 14–16px, headings 26–28px.
- **Website hero:** `clamp(44px, 6vw, 76px)`.

## Shape and spacing

- Radius 6px for cards and buttons, 4px for chips.
- Borders: 2px black for active or important things, 1.5px `line` for quiet cards.
- Touch targets at least 48px. Worker buttons are 54px tall.
- Screen padding 18px, gaps 12–14px.
- Icons on a 24px grid: stroke 2, square line caps, mitred joins.
- Focus ring: 3px solid black; white on the black nav bar.

## Components

| Component | How it looks |
|---|---|
| Primary button | Black fill, `plate` text, 2px black border. One per screen |
| Secondary button | `plate` fill, 2px black border, black text |
| AI hint | `phaseYellow` box with a 2px black border and a small round marker. It says what the AI saw and "A hint only. Your score decides." The person's choice sits next to it in black |
| Status chip | Done or verified: green fill, white text. Neutral: 1.5px black outline. In progress: black fill |
| Card header strip | Black bar with `plate` text in Rajdhani 600, 19px, for example "अगला कदम" |
| Journey bar | Four 12px segments: green done, black current, dashed `line` not yet |
| Coverage bar | 12px `divider` track; green fill at 70% or more, `line` fill below; a 3px black tick at 70% |
| Score plates | Three big plates for 0, 1 and 2; the chosen one turns black |
| Bottom nav | Black bar; the active item is `plate` with a 3px top line, the others `navOff` |
| Chart | Black for the main series and `line` for the comparison, each labelled on the chart rather than in a colour legend. Green only marks a target that is met |

## Copy

- Worker screens are Hindi first, assessor screens English first, and every string exists in both.
- No "·" separators, no arrows on buttons and no ALL CAPS labels. Use sentence case and plain verbs.
- Name actions by what happens: "रास्ता देखें", "Save score", "Sign result".

## Screens

| Screen | Reference | What it holds |
|---|---|---|
| Landing | [`screens/landing.html`](screens/landing.html) | Logo and name, language choice, then role, with a speaker button on each role |
| Apna Anubhav interview | [`screens/interview.html`](screens/interview.html) | Progress, the question with audio, picture choices, a big mic button and the transcript to confirm or change |
| Match result | [`screens/match-result.html`](screens/match-result.html) | An AI hint that the mobiliser will confirm, L3 and L4 coverage with the 70% tick, the route and the gaps |
| Worker home | [`screens/worker-home.html`](screens/worker-home.html) | Journey, the next step with date, place and what to bring, and the match summary |
| Scoring | [`screens/scoring.html`](screens/scoring.html) | Clip with GPS and hash checks, AI hint, 0/1/2 plates with the rubric line, and a reason when the score differs from the hint |
| Assessor home | To build | Sync status with the pending count, calibration, trade-pack version and today's sessions |
| Evidence capture | To build | Camera with a framing guide, the red recording dot and timer, GPS, a live AI hint and the steps to watch |
| Review and sign | To build | Result against the pass rule, NOS-wise bars, evidence checks, then PIN and "Sign result" |
| Website landing | To build | Verify a certificate, how it works, the colour key and the rater-study results |
| Dashboard | To build | Key numbers, the Round A and Round B agreement chart, flags to review and the assessors table |

Screens marked "To build" have no reference yet. Build them from this table and the rules on this page, reusing the components above.

## Implementing

- **Mobile (Expo):** load the fonts with `@expo-google-fonts/rajdhani` and `@expo-google-fonts/hind`, and keep every value in one theme file made from `tokens.json`.
- **Web (Next.js):** load Rajdhani and Hind with `next/font/google`, including the `devanagari` subset, and add the colours from `tokens.json` to the Tailwind theme.
- **Icons:** the references use Feather-style outlines. Use `lucide-react-native` and `lucide-react` with `strokeLinecap="square"` and `strokeLinejoin="miter"`.
