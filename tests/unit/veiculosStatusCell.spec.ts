import { renderStatusCell } from '../../src/tui/views/veiculosStatusCell';

describe('renderStatusCell', () => {
  it('retorna "—" quando status é null', () => {
    expect(renderStatusCell({ status: null })).toBe('—');
  });

  it('retorna "—" quando status é undefined', () => {
    expect(renderStatusCell({})).toBe('—');
  });

  it('mostra [B] quando bloqueado = true', () => {
    expect(
      renderStatusCell({
        status: { bloqueado: true, ignicaoLigada: false, online: false },
      }),
    ).toBe('[B]');
  });

  it('mostra [I] quando ignicaoLigada = true e nao bloqueado', () => {
    expect(
      renderStatusCell({
        status: { bloqueado: false, ignicaoLigada: true, online: false },
      }),
    ).toBe('[I]');
  });

  it('mostra [+] quando online = true e demais flags false', () => {
    expect(
      renderStatusCell({
        status: { bloqueado: false, ignicaoLigada: false, online: true },
      }),
    ).toBe('[+]');
  });

  it('combina bandeiras: bloqueado + online = [B+]', () => {
    expect(
      renderStatusCell({
        status: { bloqueado: true, ignicaoLigada: false, online: true },
      }),
    ).toBe('[B+]');
  });

  it('combina todas: bloqueado + ignicao + online = [BI+]', () => {
    expect(
      renderStatusCell({
        status: { bloqueado: true, ignicaoLigada: true, online: true },
      }),
    ).toBe('[BI+]');
  });

  it('combina ignicao + online sem bloqueado = [I+]', () => {
    expect(
      renderStatusCell({
        status: { bloqueado: false, ignicaoLigada: true, online: true },
      }),
    ).toBe('[I+]');
  });

  it('retorna string de 4 chars no maximo quando todas as flags sao false (sem status vivo)', () => {
    expect(
      renderStatusCell({
        status: { bloqueado: false, ignicaoLigada: false, online: false },
      }),
    ).toBe('[ ]');
  });
});
