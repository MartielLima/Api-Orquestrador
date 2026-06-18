interface StatusFlags {
  bloqueado?: boolean;
  ignicaoLigada?: boolean;
  online?: boolean;
}

export function renderStatusCell(row: Record<string, unknown>): string {
  const status = row.status as StatusFlags | null | undefined;
  if (!status) return '—';
  const parts: string[] = [];
  if (status.bloqueado) parts.push('B');
  if (status.ignicaoLigada) parts.push('I');
  if (status.online) parts.push('+');
  if (parts.length === 0) return '[ ]';
  return `[${parts.join('')}]`;
}
