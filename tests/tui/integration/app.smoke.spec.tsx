import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../../src/tui/app';
import type { BootstrapResult } from '../../../src/tui/api/bootstrap';
import { buildApiClient } from '../../../src/tui/api/client';

const user = { id: 'u1', email: 'admin@local.dev', role: 'admin', active: true, createdAt: '2026-06-15T00:00:00Z' };

function okBootstrap(): BootstrapResult {
  return {
    kind: 'ok',
    api: buildApiClient('http://localhost:4000/graphql'),
    user,
    session: {
      apiUrl: 'http://localhost:4000/graphql',
      accessToken: 'a'.repeat(40),
      refreshToken: 'b'.repeat(40),
      user,
      accessTokenExp: Date.now() + 3_600_000,
    },
  };
}

function errBootstrap(): BootstrapResult {
  return { kind: 'err', message: 'sem rede', hint: 'set TUI_API_TOKEN' };
}

describe('App', () => {
  it('renders the layout with header and sidebar when bootstrap is ok', () => {
    const { lastFrame, unmount } = render(<App bootstrap={okBootstrap()} />);
    const frame = lastFrame();
    expect(frame).toContain('API ORQUESTRADOR');
    expect(frame).toContain('Usuários');
    expect(frame).toContain('Clientes');
    expect(frame).toContain('Veículos');
    expect(frame).toContain('Motoristas');
    expect(frame).toContain('Posições');
    expect(frame).toContain('Logs');
    expect(frame).toContain('Sync');
    unmount();
  });

  it('shows an error screen when bootstrap fails', () => {
    const { lastFrame, unmount } = render(<App bootstrap={errBootstrap()} />);
    const frame = lastFrame();
    expect(frame).toContain('Falha ao iniciar');
    expect(frame).toContain('sem rede');
    expect(frame).toContain('set TUI_API_TOKEN');
    unmount();
  });
});
