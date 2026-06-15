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
    '^ink-text-input$': '<rootDir>/tests/tui/helpers/ink-text-input-shim.cjs',
    '^ink-gradient$': '<rootDir>/tests/tui/helpers/ink-gradient-shim.cjs',
    '^ink-spinner$': '<rootDir>/tests/tui/helpers/ink-spinner-shim.cjs',
    '^ink-table$': '<rootDir>/tests/tui/helpers/ink-table-shim.cjs',
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
            'ink-text-input': ['./tests/tui/helpers/ink-text-input-shim'],
            'ink-gradient': ['./tests/tui/helpers/ink-gradient-shim'],
            'ink-spinner': ['./tests/tui/helpers/ink-spinner-shim'],
            'ink-table': ['./tests/tui/helpers/ink-table-shim'],
          },
        },
      },
    ],
  },
  testTimeout: 30000,
};

export default config;
