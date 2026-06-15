import React from 'react';
import { render } from 'ink-testing-library';
import { DetailModal } from '../../../src/tui/components/DetailModal';

describe('DetailModal', () => {
  it('renders key/value pairs from data', () => {
    const data = { id: 1, nome: 'foo', ativo: true, desc: null };
    const { lastFrame, unmount } = render(
      <DetailModal title="Detalhe" data={data} onClose={() => {}} />,
    );
    const f = lastFrame();
    expect(f).toContain('Detalhe');
    expect(f).toContain('id');
    expect(f).toContain('1');
    expect(f).toContain('nome');
    expect(f).toContain('foo');
    expect(f).toContain('ativo');
    expect(f).toContain('true');
    expect(f).toContain('desc');
    expect(f).toContain('null');
    expect(f).toMatch(/fechar|Enter|Esc/);
    unmount();
  });

  it('shows empty state when data is empty', () => {
    const { lastFrame, unmount } = render(
      <DetailModal title="Vazio" data={{}} onClose={() => {}} />,
    );
    expect(lastFrame()).toMatch(/sem dados/);
    unmount();
  });
});
