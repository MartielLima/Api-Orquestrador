import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^ink-testing-library$': '<rootDir>/tests/tui/helpers/ink-testing-shim.cjs',
    '^ink$': '<rootDir>/tests/tui/helpers/ink-shim.cjs',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          target: 'es2022',
          jsx: 'react-jsx',
          jsxImportSource: 'react',
          esModuleInterop: true,
          baseUrl: '.',
          paths: {
            'ink-testing-library': ['./tests/tui/helpers/ink-testing-shim'],
            'ink': ['./tests/tui/helpers/ink-shim'],
          },
        },
      },
    ],
  },
  testTimeout: 30000,
};

export default config;
