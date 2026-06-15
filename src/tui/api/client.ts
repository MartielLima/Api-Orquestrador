import { GraphQLClient, type RequestDocument, type Variables } from 'graphql-request';

export interface ApiClient {
  request<T>(doc: RequestDocument, variables?: Variables): Promise<T>;
  setAuthToken(token: string | null): void;
}

export function buildApiClient(endpoint: string): ApiClient {
  const client = new GraphQLClient(endpoint, { fetch: globalThis.fetch });
  let token: string | null = null;
  return {
    async request<T>(doc: RequestDocument, variables?: Variables): Promise<T> {
      const headers: Record<string, string> = {};
      if (token) headers['authorization'] = `Bearer ${token}`;
      return client.request<T>(doc, variables, headers);
    },
    setAuthToken(t: string | null) {
      token = t;
    },
  };
}
