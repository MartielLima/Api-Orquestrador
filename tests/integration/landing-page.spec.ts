import { startServer, type StartedServer } from '../../src/server';

describe('landing page', () => {
  let srv: StartedServer;

  beforeAll(async () => {
    srv = await startServer();
  });

  afterAll(async () => {
    await srv.stop();
  });

  it('GET / returns 200 text/html with the app name and GitHub link', async () => {
    const res = await fetch(srv.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('Api-Orquestrador');
    expect(html).toContain('https://github.com/MartielLima/Api-Orquestrador');
  });

  it('POST / still serves GraphQL (regression)', async () => {
    const res = await fetch(srv.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ health }' }),
    });
    const json = (await res.json()) as { data?: { health?: string } };
    expect(json.data?.health).toBe('ok');
  });
});