module.exports = {
  rootDir: '.',
  testRegex: '\\.spec\\.ts$',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, module: 'commonjs' } }],
  },
};
