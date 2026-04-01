import type { Panel } from '@/components/Panel';
import type { RuntimeSecretKey } from '@/services/runtime-config';
import { setSecretValue } from '@/services/runtime-config';
import { HUMAN_LABELS, SIGNUP_URLS } from '@/services/settings-constants';
import { h, replaceChildren } from '@/utils/dom-utils';

export function showApiKeyGate(
  panel: Panel,
  keyName: RuntimeSecretKey,
  onSaved: () => void,
): void {
  const label = HUMAN_LABELS[keyName] ?? keyName;
  const signupUrl = SIGNUP_URLS[keyName];

  const input = h('input', {
    type: 'password',
    className: 'api-key-gate-input',
    placeholder: 'Paste key\u2026',
    autocomplete: 'off',
    spellcheck: 'false',
  }) as HTMLInputElement;

  const btn = h('button', { className: 'api-key-gate-save' }, 'Save') as HTMLButtonElement;
  const status = h('span', { className: 'api-key-gate-status' }) as HTMLSpanElement;

  const row = h('div', { className: 'api-key-gate-row' }, input, btn);
  const labelEl = h('p', { className: 'api-key-gate-label' }, `${label} required`);

  const children = [labelEl, row];
  if (signupUrl) {
    const link = h('a', {
      className: 'api-key-gate-signup',
      href: signupUrl,
      target: '_blank',
      rel: 'noopener',
    }, 'Get a free key \u2192') as HTMLAnchorElement;
    children.push(link);
  }
  children.push(status);

  const gate = h('div', { className: 'api-key-gate' }, ...children);

  const save = async () => {
    const value = input.value.trim();
    if (!value) return;
    btn.disabled = true;
    status.textContent = 'Saving\u2026';
    try {
      await setSecretValue(keyName, value);
      onSaved();
    } catch (err) {
      btn.disabled = false;
      status.textContent = err instanceof Error ? err.message : 'Error saving key';
    }
  };

  btn.addEventListener('click', () => { void save(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void save(); });

  replaceChildren(panel.getContentElement(), gate);
}
