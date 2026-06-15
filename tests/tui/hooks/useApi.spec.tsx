import React from 'react';
import { render } from 'ink-testing-library';
import { ApiProvider, useApi } from '../../../src/tui/hooks/useApi';
import { buildApiClient } from '../../../src/tui/api/client';
import type { AuthUser } from '../../../src/tui/api/auth';

const user: AuthUser = { id: 'u1', email: 'a@b.dev', role: 'admin', active: true, createdAt: '' };

describe('useApi module', () => {
  it('exports ApiProvider and useApi', () => {
    expect(typeof ApiProvider).toBe('function');
    expect(typeof useApi).toBe('function');
  });
});

describe('ApiProvider rendering', () => {
  it('renders children without crashing', () => {
    const api = buildApiClient('http://x');
    function Child(): React.ReactElement {
      useApi();
      return <></>;
    }
    const { unmount } = render(
      <ApiProvider value={{ api, user, apiUrl: 'http://x' }}>
        <Child />
      </ApiProvider>,
    );
    expect(unmount).toBeDefined();
    unmount();
  });
});
