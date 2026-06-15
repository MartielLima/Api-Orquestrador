import { ClientesView } from '../../../src/tui/views/Clientes';
import { VeiculosView } from '../../../src/tui/views/Veiculos';
import { MotoristasView } from '../../../src/tui/views/Motoristas';
import { SyncStatusView } from '../../../src/tui/views/SyncStatus';
import { PosicoesView } from '../../../src/tui/views/Posicoes';
import { LogsView } from '../../../src/tui/views/Logs';

describe('view exports', () => {
  it('exporta Clientes, Veiculos, Motoristas, SyncStatus, Posicoes, Logs como funções', () => {
    expect(typeof ClientesView).toBe('function');
    expect(typeof VeiculosView).toBe('function');
    expect(typeof MotoristasView).toBe('function');
    expect(typeof SyncStatusView).toBe('function');
    expect(typeof PosicoesView).toBe('function');
    expect(typeof LogsView).toBe('function');
  });
});
