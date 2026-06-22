/* eslint-disable @typescript-eslint/no-explicit-any */
import { getEventosInercia } from '../../src/domain/inercia';
import { SascarApiError } from 'sascar-sdk';

function makeCtx(orchestratorMock: any) {
  return {
    user: null,
    logger: console as unknown as any,
    db: { execute: jest.fn() } as any,
    orchestrator: orchestratorMock,
  };
}

describe('getEventosInercia', () => {
  it('chama Sascar com dataInicio, dataFim, idVeiculo, quantidade', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    await getEventosInercia(ctx, {
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
      idVeiculo: 12345,
      quantidade: 50,
    });
    expect(call).toHaveBeenCalledWith('obterDeltaTelemetriaIntegracaoInercia', [
      '2026-06-01T00:00:00Z',
      '2026-06-22T23:59:59Z',
      12345,
      50,
    ]);
  });

  it('usa quantidade default = 100 quando omitida', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    await getEventosInercia(ctx, {
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
      idVeiculo: 12345,
    });
    expect(call).toHaveBeenCalledWith('obterDeltaTelemetriaIntegracaoInercia', [
      '2026-06-01T00:00:00Z',
      '2026-06-22T23:59:59Z',
      12345,
      100,
    ]);
  });

  it('mapeia resposta do SDK para o tipo EventoInercia (sem inventar campos)', async () => {
    const call = jest.fn().mockResolvedValue([
      {
        idVeiculo: 12345,
        dataPosicao: '2026-06-22T14:30:00',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        latitude: -23.5,
        longitude: -46.6,
        velocidadeMaximaFaixaAmarela: 85.5,
        rpmMaximo: 3500,
        velocidadeMedia: 60.2,
        distanciaPercorrida: 1234.5,
        tempoDuracaoGiroMotor: 100,
        odometro: 99999,
      },
    ]);
    const ctx = makeCtx({ call });
    const result = await getEventosInercia(ctx, {
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
      idVeiculo: 12345,
      quantidade: 10,
    });
    expect(result).toEqual([
      {
        idVeiculo: 12345,
        dataPosicao: '2026-06-22T14:30:00',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        latitude: -23.5,
        longitude: -46.6,
        velocidadeMaximaFaixaAmarela: 85.5,
        rpmMaximo: 3500,
        velocidadeMedia: 60.2,
        distanciaPercorrida: 1234.5,
      },
    ]);
  });

  it('retorna [] quando Sascar devolve array vazio', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    const result = await getEventosInercia(ctx, {
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
      idVeiculo: 12345,
    });
    expect(result).toEqual([]);
  });

  it('propaga erro do Sascar via mapSascarError (GraphQLError)', async () => {
    const fault = new SascarApiError('Sascar SOAP Fault: limite excedido', {
      faultstring: 'limite excedido',
      faultcode: 'soap:Server',
    });
    const call = jest.fn().mockRejectedValue(fault);
    const ctx = makeCtx({ call });
    await expect(
      getEventosInercia(ctx, {
        dataInicio: '2026-06-01T00:00:00Z',
        dataFim: '2026-06-22T23:59:59Z',
        idVeiculo: 12345,
      }),
    ).rejects.toThrow(/Sascar/);
  });
});