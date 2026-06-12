import { buildTestServer } from '../helpers/server';

describe('Apollo server (hello world)', () => {
  it('responds to a basic introspection query', async () => {
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ __typename }' });
    expect(res.errors).toBeUndefined();
    expect(res.data).toEqual({ __typename: 'Query' });
  });

  it('responds to a healthcheck field', async () => {
    const { executeOperation } = await buildTestServer();
    const res = await executeOperation({ query: '{ health }' });
    expect(res.data).toEqual({ health: 'ok' });
  });
});
