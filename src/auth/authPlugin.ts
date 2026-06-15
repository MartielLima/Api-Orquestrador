import type { ApolloServerPlugin } from '@apollo/server';
import { verifyAccessToken } from './jwt';
import type { Secret } from 'jsonwebtoken';
import type { AuthUser } from '../context';

export interface AuthPluginConfig {
  accessSecret: Secret;
}

export function authPlugin(cfg: AuthPluginConfig): ApolloServerPlugin {
  return {
    async requestDidStart(initial) {
      const auth = initial.request.http?.headers.get('authorization');
      let user: AuthUser | null = null;
      if (auth?.startsWith('Bearer ')) {
        const token = auth.slice('Bearer '.length).trim();
        try {
          const payload = verifyAccessToken(token, { secret: cfg.accessSecret });
          user = { id: payload.sub, email: payload.email ?? '', role: payload.role ?? 'user' };
        } catch {
          user = null;
        }
      }
      return {
        async didResolveOperation(ctx) {
          (ctx.contextValue as { user: AuthUser | null }).user = user;
        },
      };
    },
  };
}
