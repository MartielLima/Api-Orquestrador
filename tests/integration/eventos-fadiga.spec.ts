/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApolloServer } from '@apollo/server';
import { Pool } from 'pg';
import { buildSascarClient, SascarOrchestrator } from '../../src/orchestrator/SascarOrchestrator';
import { typeDefs } from '../../src/graphql/schema';
import { resolvers } from '../../src/graphql/resolvers';
import { buildTestServer } from '../helpers/server';

function makeApolloWithOrch(pool: Pool, orch: SascarOrchestrator) {
  const ctx = {
    user: { id: 'test-user', email: 'test@test.com', role: 'admin' } as any,
    logger: console as unknown as any,
    db: { execute: (q: any) => pool.query(q.sql, q.args) } as any,
    orchestrator: orch,
  };
  const server = new ApolloServer({ typeDefs, resolvers });
  return { server, ctx };
}

describe('eventosFadiga GraphQL', () => {
  let pool: Pool;

  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterEach(async () => {
    await pool.end();
  });

  it('retorna 1 evento mapeado quando Sascar responde com 1 item', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    sascar.obterEventosTempoDirecao = (async () => [
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
      },
    ]) as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeApolloWithOrch(pool, orch);
    await server.start();
    const res = await server
      .executeOperation(
        {
          query:
            '{ eventosFadiga(quantidade: 10) { idVeiculo eventoTempoDirecao descricaoEvento nomeMotorista } }',
        } as any,
        { contextValue: ctx },
      )
      .then((r: any) => r.body.singleResult);

    expect(res.errors).toBeUndefined();
    expect(res.data.eventosFadiga).toHaveLength(1);
    expect(res.data.eventosFadiga[0]).toMatchObject({
      idVeiculo: 12345,
      eventoTempoDirecao: 1,
      descricaoEvento: 'JORNADA_EXCEDIDA',
      nomeMotorista: 'João Silva',
    });
    await server.stop();
  });

  it('retorna [] quando Sascar devolve array vazio', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    sascar.obterEventosTempoDirecao = (async () => []) as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeApolloWithOrch(pool, orch);
    await server.start();
    const res = await server
      .executeOperation({ query: '{ eventosFadiga { idVeiculo } }' } as any, { contextValue: ctx })
      .then((r: any) => r.body.singleResult);

    expect(res.errors).toBeUndefined();
    expect(res.data.eventosFadiga).toEqual([]);
    await server.stop();
  });

  it('retorna erro de autenticação quando ctx.user é null', async () => {
    const { executeOperation } = await buildTestServer({ user: null });
    const res = await executeOperation({ query: '{ eventosFadiga { idVeiculo } }' });
    expect(res.errors).toBeDefined();
    expect((res.errors![0] as any).extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('usa quantidade default = 100 quando omitida', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    const spy = jest.fn().mockResolvedValue([]);
    sascar.obterEventosTempoDirecao = spy as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeApolloWithOrch(pool, orch);
    await server.start();
    await server.executeOperation(
      { query: '{ eventosFadiga { idVeiculo } }' } as any,
      { contextValue: ctx },
    );
    expect(spy).toHaveBeenCalledWith(100, undefined, undefined, undefined);
    await server.stop();
  });

  it('usa quantidade custom quando fornecida', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    const spy = jest.fn().mockResolvedValue([]);
    sascar.obterEventosTempoDirecao = spy as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeApolloWithOrch(pool, orch);
    await server.start();
    await server.executeOperation(
      {
        query: 'query F($q: Int) { eventosFadiga(quantidade: $q) { idVeiculo } }',
        variables: { q: 25 },
      } as any,
      { contextValue: ctx },
    );
    expect(spy).toHaveBeenCalledWith(25, undefined, undefined, undefined);
    await server.stop();
  });
});
