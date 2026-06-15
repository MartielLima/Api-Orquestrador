import { generatePassword } from '../../../src/tui/lib/passwordGen';

describe('generatePassword', () => {
  it('produces a string of the requested length', () => {
    expect(generatePassword(16)).toHaveLength(16);
    expect(generatePassword(24)).toHaveLength(24);
  });

  it('contains at least one uppercase, one lowercase, and one digit', () => {
    const pw = generatePassword(16);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[0-9]/);
  });

  it('produces different passwords on each call', () => {
    const a = generatePassword(16);
    const b = generatePassword(16);
    expect(a).not.toBe(b);
  });
});
