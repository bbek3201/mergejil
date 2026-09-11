const nextJest = require('next/jest.js');

const createJestConfig = nextJest({ dir: './' });

const config = {
  displayName: 'mergejil',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // tsconfig-ийн `@/*` alias-ыг jest дээр бас ажиллуулна.
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testEnvironment: 'jsdom',
};

module.exports = createJestConfig(config);
