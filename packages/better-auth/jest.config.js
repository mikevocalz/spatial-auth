module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { types: ['jest', 'node'], lib: ['ES2020', 'DOM'] } }],
  },
  testRegex: '__tests__/.*\\.test\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
};
