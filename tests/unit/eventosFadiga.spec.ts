/* eslint-disable @typescript-eslint/no-explicit-any */
import { getEventosFadiga } from '../../src/domain/fadiga';
import { SascarApiError } from 'sascar-sdk';

function makeCtx(orchestratorMock: any) {
  return {
    user: null,
    logger: console as unknown as any,
    db: { execute: jest.fn() } as any,
    orchestrator: orchestratorMock,
  };
}

describe('getEventosFadiga', () => {
  it('chama Sascar com quantidade default = 100 quando omitida', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    await getEventosFadiga(ctx, {});
    expect(call).toHaveBeenCalledWith('obterEventosTempoDirecao', [
      100,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('chama Sascar com todos os args quando fornecidos', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    await getEventosFadiga(ctx, {
      quantidade: 50,
      idMotorista: 67890,
      dataInicio: '2026-06-01T00:00:00Z',
      dataFim: '2026-06-22T23:59:59Z',
    });
    expect(call).toHaveBeenCalledWith('obterEventosTempoDirecao', [
      50,
      67890,
      '2026-06-01T00:00:00Z',
      '2026-06-22T23:59:59Z',
    ]);
  });

  it('mapeia resposta do SDK para o tipo EventoFadiga (sem inventar campos)', async () => {
    const call = jest.fn().mockResolvedValue([
      {
        idVeiculo: 12345,
        dataInicio: '2026-06-22T18:00:00',
        eventoTempoDirecao: 1,
        descricaoEventoTempoDirecao: 'JORNADA_EXCEDIDA',
        eventoTempoDirecaoAnterior: 0,
        descricaoEventoTempoDirecaoAnterior: '',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        idCliente: 1,
        nomeCliente: 'Empresa X',
        latitude: -23.5,
        longitude: -46.6,
        odometro: 99999.5,
        placa: 'ABC1D23',
        cidade: 'São Paulo',
        uf: 'SP',
        rua: 'Av. Paulista',
        idMotoristaReserva: 0,
        nomeMotoristaReserva: '',
      },
    ]);
    const ctx = makeCtx({ call });
    const result = await getEventosFadiga(ctx, { quantidade: 10 });
    expect(result).toEqual([
      {
        idVeiculo: 12345,
        dataInicio: '2026-06-22T18:00:00',
        eventoTempoDirecao: 1,
        descricaoEvento: 'JORNADA_EXCEDIDA',
        eventoTempoDirecaoAnterior: 0,
        descricaoEventoAnterior: '',
        idMotorista: 67890,
        nomeMotorista: 'João Silva',
        idCliente: 1,
        nomeCliente: 'Empresa X',
        latitude: -23.5,
        longitude: -46.6,
        odometro: 99999.5,
        placa: 'ABC1D23',
      },
    ]);
  });

  it('retorna [] quando Sascar devolve array vazio', async () => {
    const call = jest.fn().mockResolvedValue([]);
    const ctx = makeCtx({ call });
    const result = await getEventosFadiga(ctx, {});
    expect(result).toEqual([]);
  });

  it('propaga erro do Sascar via mapSascarError (GraphQLError)', async () => {
    const fault = new SascarApiError('Sascar SOAP Fault: timeout', {
      faultstring: 'timeout',
      faultcode: 'soap:Client',
    });
    const call = jest.fn().mockRejectedValue(fault);
    const ctx = makeCtx({ call });
    await expect(getEventosFadiga(ctx, {})).rejects.toThrow(/Sascar/);
  });
});
