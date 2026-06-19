import { withRefreshRetry, SessionExpiredError } from '../../../src/tui/api/withRefreshRetry';

const unauthError = new Error('GraphQL error: "code":"UNAUTHENTICATED"');
const networkError = new Error('ECONNREFUSED');

const isAuthError = (err: unknown): boolean =>
  err instanceof Error && /UNAUTHENTICATED/.test(err.message);

describe('withRefreshRetry', () => {
  it('retorna o resultado da primeira tentativa sem chamar refresh', async () => {
    const doRequest = jest.fn().mockResolvedValue({ data: 'ok' });
    const refresh = jest.fn();

    const r = await withRefreshRetry(doRequest, refresh, isAuthError);

    expect(r).toEqual({ data: 'ok' });
    expect(doRequest).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('re-tenta após UNAUTHENTICATED e chama refresh uma vez', async () => {
    const doRequest = jest
      .fn()
      .mockRejectedValueOnce(unauthError)
      .mockResolvedValueOnce({ data: 'ok-after-refresh' });
    const refresh = jest.fn().mockResolvedValue('new-token');

    const r = await withRefreshRetry(doRequest, refresh, isAuthError);

    expect(r).toEqual({ data: 'ok-after-refresh' });
    expect(doRequest).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('não chama refresh em erro não-auth (rede)', async () => {
    const doRequest = jest.fn().mockRejectedValue(networkError);
    const refresh = jest.fn();

    await expect(withRefreshRetry(doRequest, refresh, isAuthError)).rejects.toBe(networkError);
    expect(doRequest).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('cada invocação paralela chama refresh uma vez (dedup é do caller)', async () => {
    let calls = 0;
    const sharedRefresh = jest.fn().mockImplementation(async () => {
      calls += 1;
      return `token-${calls}`;
    });
    const doRequest = jest.fn().mockRejectedValue(unauthError);

    await expect(
      Promise.all([
        withRefreshRetry(doRequest, sharedRefresh, isAuthError),
        withRefreshRetry(doRequest, sharedRefresh, isAuthError),
      ]),
    ).rejects.toBeInstanceOf(Error);

    expect(sharedRefresh).toHaveBeenCalledTimes(2);
    expect(doRequest).toHaveBeenCalledTimes(4);
  });

  it('lança SessionExpiredError quando refresh falha, sem re-tentar', async () => {
    const doRequest = jest.fn().mockRejectedValue(unauthError);
    const refresh = jest.fn().mockRejectedValue(new SessionExpiredError('refresh failed'));

    await expect(withRefreshRetry(doRequest, refresh, isAuthError)).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(doRequest).toHaveBeenCalledTimes(1);
  });
});
