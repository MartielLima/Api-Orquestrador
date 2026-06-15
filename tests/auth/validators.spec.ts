import {
  createUserSchema,
  updateUserSchema,
  passwordSchema,
  resetPasswordSchema,
} from '../../src/auth/validators';

describe('passwordSchema', () => {
  it.each([
    ['Aa1!aaaa', true],
    ['short1A', false],
    ['alllower1', false],
    ['ALLUPPER1', false],
    ['NoDigits!', false],
  ])('password %s valid=%s', (pw, ok) => {
    expect(passwordSchema.safeParse(pw).success).toBe(ok);
  });

  it('caps at 128 chars', () => {
    const pw = 'A1' + 'a'.repeat(127);
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
});

describe('createUserSchema', () => {
  it('accepts a valid payload', () => {
    const r = createUserSchema.safeParse({
      email: 'a@b.dev',
      password: 'Aa1!aaaa',
      role: 'admin',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const r = createUserSchema.safeParse({
      email: 'not-an-email',
      password: 'Aa1!aaaa',
      role: 'admin',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const r = createUserSchema.safeParse({
      email: 'a@b.dev',
      password: 'Aa1!aaaa',
      role: 'wizard',
    });
    expect(r.success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('accepts empty (no-op)', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(true);
  });

  it('accepts role only', () => {
    expect(updateUserSchema.safeParse({ role: 'user' }).success).toBe(true);
  });

  it('accepts active only', () => {
    expect(updateUserSchema.safeParse({ active: false }).success).toBe(true);
  });
});

describe('resetPasswordSchema', () => {
  it('rejects weak password', () => {
    expect(resetPasswordSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
  });
  it('accepts strong password', () => {
    expect(resetPasswordSchema.safeParse({ newPassword: 'Aa1!aaaa' }).success).toBe(true);
  });
});
