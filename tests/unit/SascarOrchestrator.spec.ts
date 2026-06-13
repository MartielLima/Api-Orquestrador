/* eslint-disable @typescript-eslint/no-explicit-any */
import { SascarOrchestrator, buildSascarClient } from '../../src/orchestrator/SascarOrchestrator';

describe('SascarOrchestrator', () => {
  it('serializes calls (one at a time)', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://x' });
    let inflight = 0;
    let maxInflight = 0;
    sascar.obterVeiculos = (async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 20));
      inflight--;
      return [] as any;
    }) as any;
    sascar.obterClientes = sascar.obterVeiculos as any;

    const orch = new SascarOrchestrator(sascar);
    const promises = [
      orch.call('obterVeiculos', [10]),
      orch.call('obterClientes', [10]),
      orch.call('obterVeiculos', [10]),
    ];
    await Promise.all(promises);
    expect(maxInflight).toBe(1);
  });

  it('propagates errors from the SDK', async () => {
    const sascar = buildSascarClient({ usuario: 'u', senha: 's', wsdlUrl: 'http://x' });
    sascar.obterVeiculos = (async () => {
      throw new Error('boom');
    }) as any;
    const orch = new SascarOrchestrator(sascar);
    await expect(orch.call('obterVeiculos', [10])).rejects.toThrow('boom');
  });
});
