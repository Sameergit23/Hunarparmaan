/**
 * TEMPORARY, Sprint 0 spike only. Remove when the phone sign-in of workflows
 * section 4.3 (and ADR 012's voice help) is built in Sprint 1.
 *
 * Signs in with the existing web flow, POST /v1/auth/otp then /v1/auth/login,
 * as the seeded mobiliser (9000000001, PIN 1234, the OTP shown on screen with
 * MOCK_INTEGRATIONS=true), then binds this phone with POST /v1/devices.
 * Release builds refuse to show it.
 */
import { useState } from 'react';
import { Text } from 'react-native';
import { LogIn, Send } from 'lucide-react-native';
import { Phone, Pin } from '@hunarpramaan/contracts';
import { Body, Button, Card, ErrorNote, Field, Header, Label, Screen } from '../components/wire';
import { LanguageToggle } from '../components/LanguageToggle';
import { HttpStatusError } from '../core/sync';
import { fill, useI18n, type Messages } from '../i18n';
import { API_URL, api } from '../platform/api';
import { saveSession, type StoredSession } from '../platform/session';

/** The seeded demo mobiliser (`pnpm db:seed`); a fixture, not a person. */
const DEMO_MOBILISER_PHONE = '9000000001';

function errorText(error: unknown, m: Messages): string {
  if (error instanceof HttpStatusError) {
    if (error.status === 401)
      return /expired/i.test(error.message) ? m.signIn.expired : m.signIn.wrong;
    if (error.status === 409) return m.signIn.deviceTaken;
    if (error.status === 403) return m.signIn.wrongRole;
    if (error.status === 400) return m.signIn.badPhone;
    return m.signIn.server;
  }
  return m.signIn.unreachable;
}

export function DevSignInScreen({
  deviceId,
  onSignedIn,
}: {
  deviceId: string;
  onSignedIn: (session: StoredSession) => void;
}) {
  const { m } = useI18n();
  const [phone, setPhone] = useState(DEMO_MOBILISER_PHONE);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState<'code' | 'login' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!__DEV__) {
    return (
      <Screen>
        <Header title={m.signIn.title} />
        <ErrorNote>{m.signIn.temporary}</ErrorNote>
      </Screen>
    );
  }

  const sendCode = async () => {
    setError(null);
    if (!Phone.safeParse(phone.trim()).success) {
      setError(m.signIn.badPhone);
      return;
    }
    setBusy('code');
    try {
      const response = await api.requestOtp(phone.trim());
      setChallengeId(response.challengeId);
      setDemoCode(response.mockCode ?? null);
      setOtp(response.mockCode ?? '');
    } catch (e) {
      setError(errorText(e, m));
    } finally {
      setBusy(null);
    }
  };

  const signIn = async () => {
    if (!challengeId) return;
    setError(null);
    if (!Pin.safeParse(pin).success) {
      setError(m.signIn.wrong);
      return;
    }
    setBusy('login');
    try {
      const login = await api.login({ challengeId, otp: otp.trim(), pin });
      // The worker interview starts with worker.registered, which only a mobiliser may create.
      if (login.user.role !== 'mobiliser') {
        setError(m.signIn.wrongRole);
        return;
      }
      await api.registerDevice(login.token, { deviceId, label: 'HunarPramaan spike phone' });
      const session: StoredSession = {
        token: login.token,
        expiresAt: login.expiresAt,
        user: login.user,
        apiUrl: API_URL,
      };
      await saveSession(session);
      onSignedIn(session);
    } catch (e) {
      setError(errorText(e, m));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Header title={m.signIn.title} right={<LanguageToggle />} />
      <Card>
        <Label>{m.signIn.temporary}</Label>
        <Text selectable>{API_URL}</Text>
      </Card>
      <Field
        label={m.signIn.phone}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="off"
        maxLength={13}
      />
      <Button
        label={m.signIn.sendCode}
        icon={Send}
        variant={challengeId ? 'secondary' : 'primary'}
        onPress={sendCode}
        busy={busy === 'code'}
      />
      {challengeId ? (
        <>
          {demoCode ? <Body>{fill(m.signIn.demoCode, { code: demoCode })}</Body> : null}
          <Field
            label={m.signIn.code}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Field
            label={m.signIn.pin}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />
          <Button label={m.signIn.submit} icon={LogIn} onPress={signIn} busy={busy === 'login'} />
          {busy === 'login' ? <Body>{m.signIn.binding}</Body> : null}
        </>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Screen>
  );
}
