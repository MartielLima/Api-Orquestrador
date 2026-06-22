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

describe('eventosInercia GraphQL', () => {
  let pool: Pool;

  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterEach(async () => {
    await pool.end();
  });

  it('retorna 1 evento mapeado quando Sascar responde com 1 item', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    sascar.obterDeltaTelemetriaIntegracaoInercia = (async () => [
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
    ]) as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeApolloWithOrch(pool, orch);
    await server.start();
    const res = await server
      .executeOperation(
        {
          query: `query E($di: DateTime!, $df: DateTime!, $id: Int!) {
            eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id) {
              idVeiculo dataPosicao nomeMotorista velocidadeMaximaFaixaAmarela
            }
          }`,
          variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345 },
        } as any,
        { contextValue: ctx },
      )
      .then((r: any) => r.body.singleResult);

    expect(res.errors).toBeUndefined();
    expect(res.data.eventosInercia).toHaveLength(1);
    expect(res.data.eventosInercia[0]).toMatchObject({
      idVeiculo: 12345,
      nomeMotorista: 'João Silva',
      velocidadeMaximaFaixaAmarela: 85.5,
    });
    await server.stop();
  });

  it('retorna [] quando Sascar devolve array vazio', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    sascar.obterDeltaTelemetriaIntegracaoInercia = (async () => []) as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeApolloWithOrch(pool, orch);
    await server.start();
    const res = await server
      .executeOperation(
        {
          query: `query E($di: DateTime!, $df: DateTime!, $id: Int!) {
            eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id) { idVeiculo }
          }`,
          variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345 },
        } as any,
        { contextValue: ctx },
      )
      .then((r: any) => r.body.singleResult);

    expect(res.errors).toBeUndefined();
    expect(res.data.eventosInercia).toEqual([]);
    await server.stop();
  });

  it('retorna erro de autenticação quando ctx.user é null', async () => {
    const { executeOperation } = await buildTestServer({ user: null });
    const res = await executeOperation({
      query: `query E($di: DateTime!, $df: DateTime!, $id: Int!) {
        eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id) { idVeiculo }
      }`,
      variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345 },
    });
    expect(res.errors).toBeDefined();
    expect((res.errors![0] as any).extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('usa quantidade default = 100 quando omitida', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    const spy = jest.fn().mockResolvedValue([]);
    sascar.obterDeltaTelemetriaIntegracaoInercia = spy as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeApolloWithOrch(pool, orch);
    await server.start();
    await server.executeOperation(
      {
        query: `query E($di: DateTime!, $df: DateTime!, $id: Int!) {
          eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id) { idVeiculo }
        }`,
        variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345 },
      } as any,
      { contextValue: ctx },
    );
    expect(spy).toHaveBeenCalledWith(
      '2026-06-01 00:00:00',
      '2026-06-22 23:59:59',
      12345,
      100,
    );
    await server.stop();
  });

  it('usa quantidade custom quando fornecida', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://localhost:9999' });
    const spy = jest.fn().mockResolvedValue([]);
    sascar.obterDeltaTelemetriaIntegracaoInercia = spy as any;
    const orch = new SascarOrchestrator(sascar);
    const { server, ctx } = makeApolloWithOrch(pool, orch);
    await server.start();
    await server.executeOperation(
      {
        query: `query E($di: DateTime!, $df: DateTime!, $id: Int!, $q: Int) {
          eventosInercia(dataInicio: $di, dataFim: $df, idVeiculo: $id, quantidade: $q) { idVeiculo }
        }`,
        variables: { di: '2026-06-01T00:00:00Z', df: '2026-06-22T23:59:59Z', id: 12345, q: 25 },
      } as any,
      { contextValue: ctx },
    );
    expect(spy).toHaveBeenCalledWith(
      '2026-06-01 00:00:00',
      '2026-06-22 23:59:59',
      12345,
      25,
    );
    await server.stop();
  });
});