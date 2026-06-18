/* eslint-disable @typescript-eslint/no-explicit-any */
import { extractEventsFromPosicao } from '../../src/domain/posicoes';

const FIXED_DATA_POSICAO = new Date('2026-06-18T12:00:00.000Z');
const ID_VEICULO = 123;
const ID_PACOTE = '15021070727';

function makePos(overrides: Record<string, any> = {}): any {
  return {
    idVeiculo: ID_VEICULO,
    idPacote: ID_PACOTE,
    dataPosicao: FIXED_DATA_POSICAO,
    ignicao: 0,
    bloqueio: 0,
    rpm: 1500,
    tensao: 24,
    velocidade: 60,
    jamming: 0,
    nivelCombustivel: '100',
    litrometro: '5343.539',
    ...overrides,
  };
}

describe('extractEventsFromPosicao', () => {
  it('gera 8 rows de snapshot para todos os sinais', () => {
    const events = extractEventsFromPosicao(makePos());
    const snapshotEvents = events.filter((e) => e.eventType === 'snapshot');
    expect(snapshotEvents).toHaveLength(8);
  });

  it('snapshot ignicao tem valueBool=true quando ignicao=1', () => {
    const events = extractEventsFromPosicao(makePos({ ignicao: 1 }));
    const ign = events.find((e) => e.eventType === 'snapshot' && e.signal === 'ignicao');
    expect(ign?.valueBool).toBe(true);
    expect(ign?.valueNumeric).toBeUndefined();
    expect(ign?.valueText).toBeUndefined();
  });

  it('snapshot rpm tem valueNumeric correto', () => {
    const events = extractEventsFromPosicao(makePos({ rpm: 2200 }));
    const rpm = events.find((e) => e.eventType === 'snapshot' && e.signal === 'rpm');
    expect(rpm?.valueNumeric).toBe(2200);
  });

  it('snapshot combustivel_nivel tem valueText (Sascar envia string)', () => {
    const events = extractEventsFromPosicao(makePos({ nivelCombustivel: '85' }));
    const c = events.find((e) => e.eventType === 'snapshot' && e.signal === 'combustivel_nivel');
    expect(c?.valueText).toBe('85');
  });

  it('snapshot é pulado se valor é null', () => {
    const events = extractEventsFromPosicao(makePos({ rpm: null }));
    expect(events.find((e) => e.signal === 'rpm')).toBeUndefined();
  });

  it('snapshot é pulado se valor é undefined', () => {
    const events = extractEventsFromPosicao(makePos({ tensao: undefined }));
    expect(events.find((e) => e.signal === 'tensao')).toBeUndefined();
  });

  it('gera transition para ignicao quando mudou (previous 0 → current 1)', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: 1 }),
      { ignicao: 0, bloqueio: 0, jamming: 0 },
    );
    const t = events.find((e) => e.eventType === 'transition' && e.signal === 'ignicao');
    expect(t).toBeDefined();
    expect(t?.valueBool).toBe(true);
    expect(t?.metadata).toEqual({ from_value: 0, to_value: 1 });
  });

  it('gera transition para ignicao quando mudou (previous 1 → current 0)', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: 0 }),
      { ignicao: 1, bloqueio: 0, jamming: 0 },
    );
    const t = events.find((e) => e.eventType === 'transition' && e.signal === 'ignicao');
    expect(t?.valueBool).toBe(false);
    expect(t?.metadata).toEqual({ from_value: 1, to_value: 0 });
  });

  it('gera transition para bloqueio e jamming quando mudaram', () => {
    const events = extractEventsFromPosicao(
      makePos({ bloqueio: 1, jamming: 1 }),
      { ignicao: 0, bloqueio: 0, jamming: 0 },
    );
    const tBloq = events.find((e) => e.eventType === 'transition' && e.signal === 'bloqueio');
    const tJam = events.find((e) => e.eventType === 'transition' && e.signal === 'jamming');
    expect(tBloq).toBeDefined();
    expect(tJam).toBeDefined();
  });

  it('NÃO gera transition se ignicao igual a previous', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: 1 }),
      { ignicao: 1, bloqueio: 0, jamming: 0 },
    );
    const t = events.find((e) => e.eventType === 'transition' && e.signal === 'ignicao');
    expect(t).toBeUndefined();
  });

  it('NÃO gera transition se current é null', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: null }),
      { ignicao: 0, bloqueio: 0, jamming: 0 },
    );
    const t = events.find((e) => e.eventType === 'transition' && e.signal === 'ignicao');
    expect(t).toBeUndefined();
  });

  it('NÃO gera transition se previous não foi passado', () => {
    const events = extractEventsFromPosicao(makePos({ ignicao: 1 }));
    const t = events.find((e) => e.eventType === 'transition');
    expect(t).toBeUndefined();
  });

  it('todos os eventos têm idVeiculo, idPacote, dataPosicao corretos', () => {
    const events = extractEventsFromPosicao(
      makePos({ ignicao: 1 }),
      { ignicao: 0, bloqueio: 0, jamming: 0 },
    );
    for (const e of events) {
      expect(e.idVeiculo).toBe(ID_VEICULO);
      expect(e.idPacote).toBe(ID_PACOTE);
      expect(e.dataPosicao).toEqual(FIXED_DATA_POSICAO);
    }
  });
});