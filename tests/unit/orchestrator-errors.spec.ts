import { GraphQLError } from 'graphql';
import { mapSascarError } from '../../src/orchestrator/errors';
import {
  SascarApiError,
  SascarAuthError,
  SascarConnectionError,
  SascarRateLimitError,
  SascarTimeoutError,
} from 'sascar-sdk';

describe('mapSascarError', () => {
  it('maps auth error', () => {
    const e = mapSascarError(new SascarAuthError('bad creds', 401));
    expect(e).toBeInstanceOf(GraphQLError);
    expect(e.extensions.code).toBe('SASCAR_AUTH');
  });

  it('maps rate limit error with retryAfter', () => {
    const e = mapSascarError(
      Object.assign(new SascarRateLimitError('rate limited'), { retryAfter: 30 }),
    ) as GraphQLError;
    expect(e.extensions.code).toBe('SASCAR_RATE_LIMIT');
    expect(e.extensions.retryAfter).toBe(30);
  });

  it('maps timeout error', () => {
    const e = mapSascarError(new SascarTimeoutError('timed out', 5000));
    expect(e.extensions.code).toBe('SASCAR_TIMEOUT');
    expect(e.extensions.timeoutMs).toBe(5000);
  });

  it('maps connection error', () => {
    const e = mapSascarError(new SascarConnectionError('connection reset'));
    expect(e.extensions.code).toBe('SASCAR_NETWORK');
  });

  it('maps api/fault error', () => {
    const e = mapSascarError(
      new SascarApiError('fault', { faultstring: 'Server fault', faultcode: 'soap:Server' }),
    );
    expect(e.extensions.code).toBe('SASCAR_FAULT');
    expect(e.extensions.faultcode).toBe('soap:Server');
  });

  it('maps unknown error to INTERNAL', () => {
    const e = mapSascarError(new Error('x'));
    expect(e.extensions.code).toBe('INTERNAL');
  });
});
