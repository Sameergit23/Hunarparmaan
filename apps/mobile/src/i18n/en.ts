/**
 * English strings for the phone app. Rule 7: hi.ts must have the same keys
 * (its type checks it). Worker screens are Hindi first and staff screens
 * English first; `resolveLang` picks the language for each screen.
 * Copy rules (wire-code.md): sentence case, no "·" separators, no arrows.
 */
export const en = {
  app: {
    name: 'HunarPramaan',
    nameOther: 'हुनर प्रमाण',
    tagline: 'Your skill, now certified',
    loadFailed: "The phone's saved data could not be opened. Close the app and open it again.",
  },
  common: {
    back: 'Back',
    listen: 'Listen: {text}',
    listenScreen: 'Listen to this screen',
    next: 'Next',
    cancel: 'Cancel',
    tryAgain: 'Try again',
    signOut: 'Sign out',
    comingNext: 'This screen is being built next. You can already move between screens.',
    offlineSaved: 'Everything is saved on the phone, even without internet',
  },
  ai: {
    label: 'AI hint',
    hintOnlyStaff: 'A hint only. Your score decides.',
    hintOnlyWorker: 'This is an AI suggestion. The mobiliser will check and confirm it.',
  },
  landing: {
    chooseLanguage: 'Choose language / भाषा चुनें',
    hindi: 'हिंदी',
    english: 'English',
    whoAreYou: 'Who are you?',
    workerTitle: 'I am a worker',
    workerBody: 'Tell us your experience by speaking',
    staffTitle: 'I am an assessor or mobiliser',
    staffBody: 'Sign in with OTP and PIN',
    selected: 'Selected',
  },
  signIn: {
    title: 'Sign in',
    subtitle: 'For mobilisers and assessors',
    firstTimeOnline: 'The first sign-in needs the internet. After that you can work offline.',
    phoneLabel: 'Mobile number',
    phoneHint: '10 digits, for example 98xxxxxx10',
    sendCode: 'Send code',
    codeLabel: 'Code from SMS',
    codeSent: 'We sent a 6-digit code to {phone}.',
    demoCode: 'Demo mode: the code is {code}',
    changeNumber: 'Change number',
    pinLabel: 'Your PIN',
    pinHint: '4 to 6 digits',
    submit: 'Sign in',
    signedInAs: 'Signed in as {name}',
    steps: { phone: 'Number', code: 'Code', pin: 'PIN' },
    errors: {
      phone: 'Enter a 10-digit mobile number.',
      code: 'Enter the 6-digit code.',
      pin: 'Enter your 4 to 6 digit PIN.',
      wrong: 'Wrong code or PIN. Check them and try again.',
      expired: 'This code has expired. Ask for a new one.',
      network: 'No internet. Signing in the first time needs the internet.',
      notConfigured: 'SMS is not set up on this server. Ask the team to turn on demo mode.',
      role: 'This app is for mobilisers and assessors. Use the website for your role.',
      otherAccount:
        'This phone has {count} saved entries from another account that are not synced yet. That person must sign in and sync first.',
      generic: 'Something went wrong. Try again in a moment.',
    },
  },
  sync: {
    title: 'Sync',
    pending: '{count} waiting to sync',
    allSynced: 'Everything is synced',
    lastSync: 'Last synced {time}',
    never: 'Not synced yet',
    offline: 'No internet. Saved on the phone; it will sync later.',
    signedOut: 'Sign in to sync',
    needsSignIn: 'Your sign-in has expired. Sign in again to sync.',
    syncing: 'Syncing',
    retryAt: 'Trying again at {time}',
    rejected: '{count} not accepted by the server',
    syncNow: 'Sync now',
  },
  journey: {
    label: 'Your journey',
    done: 'done',
    current: 'now',
    todo: 'not yet',
    step: '{label}, {state}',
  },
  coverage: {
    label: '{percent}% covered. The black line is {threshold}%.',
  },
  score: {
    label: 'Your score',
    plate: 'Score {value}: {label}',
    defaults: { '0': "Can't do it", '1': 'Partly', '2': 'Correct, safe' },
  },
  nav: { label: 'Main' },
  field: { error: 'Error: {message}' },
  roles: {
    worker: 'Worker',
    mobiliser: 'Mobiliser',
    assessor: 'Assessor',
    master_assessor: 'Master assessor',
  },
  screens: {
    worker: {
      consent: 'Consent',
      interview: 'Your experience',
      match: 'Your match',
      home: 'Home',
      help: 'Help',
    },
    mobiliser: {
      index: 'Workers on this phone',
      register: 'Register a worker',
      route: 'Decide the route',
    },
    assessor: {
      index: 'Assessor home',
      start: 'Start a session',
      calibrate: 'Calibration',
      capture: 'Record evidence',
      score: 'Score a criterion',
      sign: 'Review and sign',
    },
  },
};

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : { [K in keyof T]: Widen<T[K]> };

/** The shape every language must fill. */
export type Messages = Widen<typeof en>;
