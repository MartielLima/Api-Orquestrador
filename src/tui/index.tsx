import React from 'react';
import { render } from 'ink';
import { bootstrapSession } from './api/bootstrap';
import { App } from './app';

async function main(): Promise<void> {
  const result = await bootstrapSession();
  render(<App bootstrap={result} />, { exitOnCtrlC: true });
}

void main().catch((e) => {
  console.error('Falha inesperada na TUI:', e);
  process.exit(1);
});

