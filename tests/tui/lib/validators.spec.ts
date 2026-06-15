import {
  emailRule, passwordRule, createUserInputRule, updateUserInputRule, resetPasswordRule,
} from '../../../src/tui/lib/validators';

describe('tui validators', () => {
  it('emailRule accepts valid emails', () => {
    expect(emailRule.test('a@b.dev')).toBe(true);
  });

  it('emailRule rejects invalid emails', () => {
    expect(emailRule.test('not-an-email')).toBe(false);
    expect(emailRule.test('a@b')).toBe(false);
  });

  it('passwordRule requires 8+ chars, mixed case, digit', () => {
    expect(passwordRule.test('Aa1!aaaa')).toBe(true);
    expect(passwordRule.test('short1A')).toBe(false);
    expect(passwordRule.test('alllower1')).toBe(false);
  });

  it('createUserInputRule validates object shape', () => {
    const ok = createUserInputRule.safeParse({ email: 'a@b.dev', password: 'Aa1!aaaa', role: 'admin' });
    expect(ok.success).toBe(true);
    const bad = createUserInputRule.safeParse({ email: 'bad', password: 'short', role: 'wizard' });
    expect(bad.success).toBe(false);
  });

  it('updateUserInputRule accepts partial', () => {
    expect(updateUserInputRule.safeParse({ role: 'user' }).success).toBe(true);
    expect(updateUserInputRule.safeParse({ active: false }).success).toBe(true);
    expect(updateUserInputRule.safeParse({}).success).toBe(true);
  });

  it('resetPasswordRule requires the password', () => {
    expect(resetPasswordRule.safeParse({ newPassword: 'Aa1!aaaa' }).success).toBe(true);
    expect(resetPasswordRule.safeParse({ newPassword: 'short' }).success).toBe(false);
  });
});
