import React from 'react';
import { Box, Text } from 'ink';
import { Modal } from './Modal';

interface Shortcut { key: string; label: string; }

interface Props {
  activeView: string;
}

const GLOBAL: Shortcut[] = [
  { key: '1-7', label: 'navegar entre views' },
  { key: 'q / Ctrl+C', label: 'sair' },
  { key: '?', label: 'este help' },
  { key: 'H', label: 'toggle header' },
  { key: 'Esc', label: 'fechar modal' },
];

const VIEW_SHORTCUTS: Record<string, Shortcut[]> = {
  users: [
    { key: 'n', label: 'novo usuário' },
    { key: 'e', label: 'editar role' },
    { key: 'a', label: 'ativar/desativar' },
    { key: 'p', label: 'reset senha' },
    { key: 't', label: 'ver tokens' },
    { key: 'r', label: 'refresh' },
  ],
  clientes: [
    { key: 'f', label: 'filtrar por id' },
    { key: 'r', label: 'refresh' },
  ],
  veiculos: [
    { key: 'f', label: 'filtrar por id' },
    { key: 'r', label: 'refresh' },
  ],
  motoristas: [
    { key: 'f', label: 'filtrar por id' },
    { key: 'r', label: 'refresh' },
  ],
  posicoes: [
    { key: 'Tab', label: 'recentes / por veículo' },
    { key: 'm', label: 'toggle mapa ASCII' },
  ],
  logs: [
    { key: 'f', label: 'editar filtros' },
    { key: 's', label: 'follow/unfollow' },
    { key: 'r', label: 'refresh' },
    { key: 'x', label: 'limpar filtros' },
  ],
  sync: [
    { key: 'r', label: 'refresh' },
  ],
};

export function HelpOverlay({ activeView }: Props): React.ReactElement {
  const view = VIEW_SHORTCUTS[activeView] ?? [];
  return (
    <Modal title="Ajuda — atalhos" width={70}>
      <Box flexDirection="column">
        <Text bold>Globais</Text>
        {GLOBAL.map((s) => (
          <Box key={s.key}>
            <Text color="yellow">[{s.key.padEnd(14)}]</Text>
            <Text>{s.label}</Text>
          </Box>
        ))}
        {view.length > 0 ? (
          <>
            <Box marginTop={1}><Text bold>View: {activeView}</Text></Box>
            {view.map((s) => (
              <Box key={s.key}>
                <Text color="yellow">[{s.key.padEnd(14)}]</Text>
                <Text>{s.label}</Text>
              </Box>
            ))}
          </>
        ) : null}
        <Box marginTop={1}>
          <Text dimColor>Pressione ? ou Esc para fechar.</Text>
        </Box>
      </Box>
    </Modal>
  );
}
