const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Putanja do Next.js aplikacije za učitavanje next.config.js i .env fajlova
  dir: "./",
});

const customJestConfig = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    // Mapiranje @ alijasa (mora se podudarati sa tsconfig.json)
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

module.exports = createJestConfig(customJestConfig);
