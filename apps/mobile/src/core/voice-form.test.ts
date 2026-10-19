import { describe, expect, it } from 'vitest';
import { hearForm, startVoiceForm, type VoiceFormState } from './voice-form';

const empty = { name: '', phone: '', language: null };

function hearAll(...heard: string[]): VoiceFormState {
  return heard.reduce(hearForm, startVoiceForm(empty));
}

describe('the new-worker voice assistant', () => {
  it('fills the whole form from speech, then waits for yes', () => {
    const state = hearAll('रमेश कुमार', 'नौ आठ सात छह पाँच चार तीन दो एक शून्य', 'हिंदी');
    expect(state.step).toBe('confirm');
    expect(state.form).toEqual({ name: 'रमेश कुमार', phone: '9876543210', language: 'hi' });
    expect(hearForm(state, 'हाँ सही है').step).toBe('done');
  });

  it('asks for the rest of a number that is too short, and carries on from it', () => {
    let state = hearAll('रमेश', 'नौ आठ सात छह पाँच');
    expect(state).toMatchObject({ step: 'phone', problem: 'phone_too_few', missing: 5 });
    expect(state.form.phone).toBe('98765');
    state = hearForm(state, 'चार तीन दो एक शून्य');
    expect(state).toMatchObject({ step: 'language', problem: null });
    expect(state.form.phone).toBe('9876543210');
  });

  it('refuses a number that cannot be a mobile number', () => {
    expect(hearAll('रमेश', 'तीन दो एक').problem).toBe('phone_not_mobile');
  });

  it('says when it heard nothing, or Vosk heard only unknown words', () => {
    expect(hearAll('[unk]').problem).toBe('heard_nothing');
    expect(hearAll('रमेश', '').problem).toBe('heard_nothing');
  });

  it('asks again when the language or the yes is unclear', () => {
    const state = hearAll('रमेश', 'नौ आठ सात छह पाँच चार तीन दो एक शून्य', 'मराठी');
    expect(state).toMatchObject({ step: 'language', problem: 'language_unclear' });
    const confirm = hearForm(hearForm(state, 'English'), 'हाँ नहीं');
    expect(confirm).toMatchObject({ step: 'confirm', problem: 'yes_no_unclear' });
  });

  it('starts again from the name on no, keeping what was heard', () => {
    const state = hearForm(
      hearAll('रमेश', 'नौ आठ सात छह पाँच चार तीन दो एक शून्य', 'हिंदी'),
      'नहीं',
    );
    expect(state.step).toBe('name');
    expect(state.form.phone).toBe('9876543210');
  });

  it('goes back a step on "पीछे"', () => {
    expect(hearAll('रमेश', 'पीछे').step).toBe('name');
  });
});
