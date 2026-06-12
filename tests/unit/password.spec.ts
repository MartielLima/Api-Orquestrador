import { hashPassword, verifyPassword } from '../../src/auth/password';

describe('password', () => {
  it('hashes a password and verifies the original', async () => {
    const hash = await hashPassword('super-secret');
    expect(hash).not.toBe('super-secret');
    expect(await verifyPassword('super-secret', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('super-secret');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
