export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export async function withRefreshRetry<T>(
  doRequest: () => Promise<T>,
  refresh: () => Promise<string>,
  isAuthError: (err: unknown) => boolean,
): Promise<T> {
  try {
    return await doRequest();
  } catch (err) {
    if (!isAuthError(err)) throw err;
    const newToken = await refresh();
    return doRequest();
  }
}
