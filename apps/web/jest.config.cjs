module.exports = {
  rootDir: '.',
  testRegex: 'src/lib/auth/.*\\.spec\\.ts$',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { esModuleInterop: true, module: 'commonjs' } }],
  },
};
