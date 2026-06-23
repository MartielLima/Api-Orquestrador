import type { ApolloServerPlugin } from '@apollo/server';

export function landingPagePlugin(html: string): ApolloServerPlugin {
  return {
    async serverWillStart() {
      return {
        async renderLandingPage() {
          return { html };
        },
      };
    },
  };
}
