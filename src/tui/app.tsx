import React, { useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { useInput, useApp } from 'ink';
import { Header } from './components/Header';
import { Sidebar, type NavItem } from './components/Sidebar';
import { Footer } from './components/Footer';
import { StatusBar } from './components/StatusBar';
import { HelpOverlay } from './components/HelpOverlay';
import { ApiProvider, type ApiContext } from './hooks/useApi';
import type { BootstrapResult } from './api/bootstrap';
import { UsersView } from './views/Users';
import { ClientesView } from './views/Clientes';
import { VeiculosView } from './views/Veiculos';
import { MotoristasView } from './views/Motoristas';
import { PosicoesView } from './views/Posicoes';
import { LogsView } from './views/Logs';
import { SyncStatusView } from './views/SyncStatus';

interface NavDef {
  key: string;
  label: string;
  render: () => React.ReactElement;
  hints: { key: string; label: string }[];
}

const NAV: NavDef[] = [
  { key: 'users',     label: '1 Usuários',  render: () => <UsersView />,     hints: [{ key: 'n', label: 'novo' }, { key: 'e', label: 'editar' }, { key: 'a', label: 'ativar' }, { key: 'p', label: 'senha' }, { key: 't', label: 'tokens' }, { key: 'r', label: 'refresh' }] },
  { key: 'clientes',  label: '2 Clientes',  render: () => <ClientesView />,  hints: [{ key: 'f', label: 'filtrar' }, { key: 'r', label: 'refresh' }] },
  { key: 'veiculos',  label: '3 Veículos',  render: () => <VeiculosView />,  hints: [{ key: 'f', label: 'filtrar' }, { key: 'r', label: 'refresh' }] },
  { key: 'motoristas',label: '4 Motoristas',render: () => <MotoristasView />,hints: [{ key: 'f', label: 'filtrar' }, { key: 'r', label: 'refresh' }] },
  { key: 'posicoes',  label: '5 Posições',  render: () => <PosicoesView />,  hints: [{ key: 'Tab', label: 'recentes/veículo' }, { key: 'm', label: 'mapa' }] },
  { key: 'logs',      label: '6 Logs',      render: () => <LogsView />,      hints: [{ key: 'f', label: 'filtros' }, { key: 's', label: 'follow' }, { key: 'r', label: 'refresh' }, { key: 'x', label: 'limpar' }] },
  { key: 'sync',      label: '7 Sync',      render: () => <SyncStatusView />,hints: [{ key: 'r', label: 'refresh' }] },
];

const NAV_ITEMS: NavItem[] = NAV.map((n) => ({ key: n.key, label: n.label }));

interface AppProps {
  bootstrap: BootstrapResult;
}

function ErrorScreen({ message, hint }: { message: string; hint?: string }): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="red">
      <Text bold color="red">✗ Falha ao iniciar a TUI</Text>
      <Text>{message}</Text>
      {hint ? <Text dimColor>{hint}</Text> : null}
      <Box marginTop={1}><Text dimColor>Pressione Ctrl+C para sair.</Text></Box>
    </Box>
  );
}

function TuiApp({ api, user, apiUrl, tokenExp }: ApiContext & { tokenExp: number }): React.ReactElement {
  const { exit } = useApp();
  const [viewKey, setViewKey] = useState<string>('users');
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [showHelp, setShowHelp] = useState<boolean>(false);

  useInput((input, key) => {
    if (showHelp) {
      if (input === '?' || key.escape) setShowHelp(false);
      return;
    }
    if (input === '?') { setShowHelp(true); return; }
    if (input === 'H') { setShowHeader((h) => !h); return; }
    if (input === 'q' && !key.ctrl) { exit(); return; }
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.tab) {
      const idx = NAV.findIndex((n) => n.key === viewKey);
      const next = NAV[(idx + 1) % NAV.length];
      setViewKey(next.key);
      return;
    }
    if (key.shift && key.tab) {
      const idx = NAV.findIndex((n) => n.key === viewKey);
      const prev = NAV[(idx - 1 + NAV.length) % NAV.length];
      setViewKey(prev.key);
      return;
    }
    const n = Number.parseInt(input, 10);
    if (Number.isInteger(n) && n >= 1 && n <= NAV.length) {
      setViewKey(NAV[n - 1]!.key);
    }
  });

  const active = NAV.find((n) => n.key === viewKey) ?? NAV[0]!;
  const ctx = useMemo<ApiContext>(() => ({ api, user, apiUrl }), [api, user, apiUrl]);

  return (
    <ApiProvider value={ctx}>
      <Box flexDirection="column" width="100%" height="100%">
        {showHeader ? <Header user={user} /> : null}
        <Box flexGrow={1}>
          <Sidebar items={NAV_ITEMS} activeKey={viewKey} onSelect={setViewKey} />
          <Box flexDirection="column" flexGrow={1} paddingX={1}>
            {active.render()}
          </Box>
        </Box>
        <StatusBar user={user} apiUrl={apiUrl} tokenExp={tokenExp} />
        <Footer hints={[{ key: '?', label: 'ajuda' }, ...active.hints]} />
        {showHelp ? <HelpOverlay activeView={viewKey} /> : null}
      </Box>
    </ApiProvider>
  );
}

export function App({ bootstrap }: AppProps): React.ReactElement {
  if (bootstrap.kind === 'err') {
    return <ErrorScreen message={bootstrap.message} hint={bootstrap.hint} />;
  }
  const { api, user, session } = bootstrap;
  return <TuiApp api={api} user={user} apiUrl={session.apiUrl} tokenExp={session.accessTokenExp} />;
}
