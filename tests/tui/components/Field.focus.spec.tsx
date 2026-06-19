import { render } from 'ink-testing-library';
import React from 'react';
import { Field } from '../../../src/tui/components/Form';
import {
  getInputFocused,
  reportInputFocus,
  subscribeInputFocus,
} from '../../../src/tui/hooks/useInputFocus';

describe('useInputFocus store', () => {
  beforeEach(() => {
    while (getInputFocused()) reportInputFocus(false);
  });

  it('starts idle', () => {
    expect(getInputFocused()).toBe(false);
  });

  it('reportInputFocus toggles state', () => {
    reportInputFocus(true);
    expect(getInputFocused()).toBe(true);
    reportInputFocus(false);
    expect(getInputFocused()).toBe(false);
  });

  it('clamp at zero prevents underflow', () => {
    reportInputFocus(false);
    reportInputFocus(false);
    expect(getInputFocused()).toBe(false);
  });

  it('subscribeInputFocus notifies on change', () => {
    const seen: boolean[] = [];
    const unsub = subscribeInputFocus((v) => seen.push(v));
    reportInputFocus(true);
    reportInputFocus(false);
    reportInputFocus(true);
    unsub();
    reportInputFocus(false);
    expect(seen).toEqual([true, false, true]);
  });
});