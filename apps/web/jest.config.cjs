const path = require('path');

function resolveTsJest() {
  try {
    return require.resolve('ts-jest');
  } catch {
    return require.resolve('ts-jest', {
      paths: [path.resolve(__dirname, '../api/node_modules')],
    });
  }
}

module.exports = {
  rootDir: '.',
  testRegex: '\\.spec\\.ts$',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': [resolveTsJest(), { tsconfig: { esModuleInterop: true, module: 'commonjs', jsx: 'react' } }],
  },
};
