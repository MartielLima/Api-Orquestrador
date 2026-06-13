import { SascarClient, AsyncQueue } from 'sascar-sdk';

export interface ClientOptions {
  usuario: string;
  senha: string;
  wsdlUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export function buildSascarClient(opts: ClientOptions): SascarClient {
  return new SascarClient(
    { usuario: opts.usuario, senha: opts.senha },
    {
      wsdlUrl: opts.wsdlUrl,
      timeoutMs: opts.timeoutMs ?? 30_000,
      maxRetries: opts.maxRetries ?? 3,
    },
  );
}

export type SascarMethod = keyof SascarClient;

export class SascarOrchestrator {
  private queue = new AsyncQueue();

  constructor(private sascar: SascarClient) {}

  async call<T>(method: SascarMethod, args: unknown[]): Promise<T> {
    return this.queue.enqueue(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (this.sascar as any)[method];
      if (typeof fn !== 'function') {
        throw new Error(`Método Sascar inválido: ${String(method)}`);
      }
      return (await fn.apply(this.sascar, args)) as T;
    });
  }
}
