import { GraphQLClient, type RequestDocument, type Variables } from 'graphql-request';

export interface ApiClient {
  request<T>(doc: RequestDocument, variables?: Variables): Promise<T>;
  setAuthToken(token: string | null): void;
}

export function buildApiClient(endpoint: string): ApiClient {
  const client = new GraphQLClient(endpoint, { fetch: globalThis.fetch });
  let token: string | null = null;
  const applyToken = (): void => {
    if (token) {
      client.setHeader('authorization', `Bearer ${token}`);
    } else {
      client.setHeader('authorization', '');
    }
  };
  return {
    async request<T>(doc: RequestDocument, variables?: Variables): Promise<T> {
      applyToken();
      return client.request<T>(doc, variables);
    },
    setAuthToken(t: string | null) {
      token = t;
      applyToken();
    },
  };
}
