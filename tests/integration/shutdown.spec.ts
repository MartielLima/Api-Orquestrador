import { installShutdown, type ShutdownHandle } from '../../src/lib/shutdown';

describe('installShutdown', () => {
  it('registers handlers without throwing', () => {
    const handle: ShutdownHandle = { stopServer: async () => {}, tasks: [] };
    expect(() => installShutdown(handle)).not.toThrow();
  });
});
