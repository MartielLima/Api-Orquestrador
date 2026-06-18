/* eslint-disable @typescript-eslint/no-explicit-any */
import { mapPosicaoRowToVeiculoStatus } from '../../src/domain/veiculosStatus';

const FIXED_NOW = new Date('2026-06-18T12:00:00.000Z');

function makeRow(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id_veiculo: 123,
    data_posicao: new Date('2026-06-18T11:55:00.000Z'),
    latitude: -23.5,
    longitude: -46.6,
    velocidade: 60,
    ignicao: 1,
    direcao: 90,
    raw: {
      bloqueio: 1,
      gps: 1,
      jamming: 0,
      nivelCombustivel: '75',
      litrometro: '40.5',
      tensao: 13.8,
      rpm: 2200,
      temperatura1: 22.5,
      temperatura2: 23.0,
      temperatura3: 24.1,
      statusAncora: 0,
      pontoEntrada: 0,
      pontoSaida: 0,
      nomeMensagem: '',
      conteudoMensagem: '',
      textoMensagem: '',
    },
    ...overrides,
  };
}

describe('mapPosicaoRowToVeiculoStatus', () => {
  it('bloqueado = true quando raw.bloqueio === 1', () => {
    const s = mapPosicaoRowToVeiculoStatus(makeRow(), FIXED_NOW);
    expect(s.bloqueado).toBe(true);
  });

  it('bloqueado = false quando raw.bloqueio === 0', () => {
    const s = mapPosicaoRowToVeiculoStatus(
      makeRow({ raw: { bloqueio: 0 } }),
      FIXED_NOW,
    );
    expect(s.bloqueado).toBe(false);
  });

  it('ignicaoLigada = true quando coluna ignicao === 1', () => {
    const s = mapPosicaoRowToVeiculoStatus(makeRow({ ignicao: 1 }), FIXED_NOW);
    expect(s.ignicaoLigada).toBe(true);
  });

  it('ignicaoLigada = false quando coluna ignicao === 0', () => {
    const s = mapPosicaoRowToVeiculoStatus(makeRow({ ignicao: 0 }), FIXED_NOW);
    expect(s.ignicaoLigada).toBe(false);
  });

  it('ignicaoLigada = false quando coluna ignicao é null', () => {
    const s = mapPosicaoRowToVeiculoStatus(makeRow({ ignicao: null }), FIXED_NOW);
    expect(s.ignicaoLigada).toBe(false);
  });

  it('online = true quando dataPosicao está dentro de 10 minutos de agora', () => {
    const row = makeRow({ data_posicao: new Date('2026-06-18T11:51:00.000Z') });
    expect(mapPosicaoRowToVeiculoStatus(row, FIXED_NOW).online).toBe(true);
  });

  it('online = false quando dataPosicao tem mais de 10 minutos', () => {
    const row = makeRow({ data_posicao: new Date('2026-06-18T11:49:00.000Z') });
    expect(mapPosicaoRowToVeiculoStatus(row, FIXED_NOW).online).toBe(false);
  });

  it('online = false quando dataPosicao tem exatamente 10 minutos (boundary)', () => {
    const row = makeRow({ data_posicao: new Date('2026-06-18T11:50:00.000Z') });
    expect(mapPosicaoRowToVeiculoStatus(row, FIXED_NOW).online).toBe(false);
  });

  it('localizacao = latitude, longitude, velocidade, direcao das colunas', () => {
    const s = mapPosicaoRowToVeiculoStatus(
      makeRow({ latitude: -22.1, longitude: -47.2, velocidade: 80, direcao: 180 }),
      FIXED_NOW,
    );
    expect(s.localizacao).toEqual({
      latitude: -22.1,
      longitude: -47.2,
      velocidade: 80,
      direcao: 180,
    });
  });

  it('localizacao.direcao = null quando coluna direcao é null', () => {
    const s = mapPosicaoRowToVeiculoStatus(makeRow({ direcao: null }), FIXED_NOW);
    expect(s.localizacao.direcao).toBeNull();
  });

  it('gps e jamming derivados de raw', () => {
    const s = mapPosicaoRowToVeiculoStatus(
      makeRow({ raw: { gps: 0, jamming: 1 } }),
      FIXED_NOW,
    );
    expect(s.gps).toBe(false);
    expect(s.jamming).toBe(true);
  });

  it('combustivel populado a partir de raw.nivelCombustivel e raw.litrometro', () => {
    const s = mapPosicaoRowToVeiculoStatus(
      makeRow({ raw: { nivelCombustivel: '50', litrometro: '30.0' } }),
      FIXED_NOW,
    );
    expect(s.combustivel).toEqual({ nivel: '50', litrometro: '30.0' });
  });

  it('combustivel = null quando raw.nivelCombustivel e raw.litrometro ausentes', () => {
    const s = mapPosicaoRowToVeiculoStatus(makeRow({ raw: {} }), FIXED_NOW);
    expect(s.combustivel).toBeNull();
  });

  it('sensores populado a partir de raw.tensao, rpm e temperaturas', () => {
    const s = mapPosicaoRowToVeiculoStatus(
      makeRow({
        raw: {
          tensao: 12.5,
          rpm: 1500,
          temperatura1: 20,
          temperatura2: 21,
          temperatura3: 22,
        },
      }),
      FIXED_NOW,
    );
    expect(s.sensores).toEqual({
      tensao: 12.5,
      rpm: 1500,
      temperatura1: 20,
      temperatura2: 21,
      temperatura3: 22,
    });
  });

  it('sensores = null para todos os campos quando raw está vazio', () => {
    const s = mapPosicaoRowToVeiculoStatus(makeRow({ raw: {} }), FIXED_NOW);
    expect(s.sensores).toEqual({
      tensao: null,
      rpm: null,
      temperatura1: null,
      temperatura2: null,
      temperatura3: null,
    });
  });

  it('alarme.statusAncora e flags de ponto derivados de raw', () => {
    const s = mapPosicaoRowToVeiculoStatus(
      makeRow({
        raw: {
          statusAncora: 2,
          pontoEntrada: 1,
          pontoSaida: 0,
          nomeMensagem: '',
          conteudoMensagem: '',
          textoMensagem: '',
        },
      }),
      FIXED_NOW,
    );
    expect(s.alarme).toEqual({
      statusAncora: 2,
      pontoEntrada: true,
      pontoSaida: false,
      ultimaMensagem: null,
    });
  });

  it('alarme.ultimaMensagem populado quando raw traz texto não-vazio', () => {
    const s = mapPosicaoRowToVeiculoStatus(
      makeRow({
        raw: {
          nomeMensagem: 'ALERTA',
          conteudoMensagem: 'Velocidade excedida',
          textoMensagem: 'Reduza a velocidade',
        },
      }),
      FIXED_NOW,
    );
    expect(s.alarme.ultimaMensagem).toEqual({
      nome: 'ALERTA',
      conteudo: 'Velocidade excedida',
      texto: 'Reduza a velocidade',
    });
  });

  it('alarme.ultimaMensagem = null quando todos os campos de mensagem são vazios', () => {
    const s = mapPosicaoRowToVeiculoStatus(makeRow(), FIXED_NOW);
    expect(s.alarme.ultimaMensagem).toBeNull();
  });

  it('atualizadoEm = dataPosicao da row', () => {
    const dp = new Date('2026-06-18T11:55:00.000Z');
    const s = mapPosicaoRowToVeiculoStatus(makeRow({ data_posicao: dp }), FIXED_NOW);
    expect(s.atualizadoEm).toBe(dp);
  });

  it('idadeSegundos = (now - dataPosicao) em segundos, arredondado para baixo', () => {
    const s = mapPosicaoRowToVeiculoStatus(
      makeRow({ data_posicao: new Date('2026-06-18T11:55:30.000Z') }),
      FIXED_NOW,
    );
    expect(s.idadeSegundos).toBe(270);
  });
});
