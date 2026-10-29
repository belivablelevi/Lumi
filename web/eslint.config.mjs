import next from "eslint-config-next/core-web-vitals";

const config = [
  ...next,
  { ignores: [".next/**", ".next-*/**", "node_modules/**", "public/**", "test-results/**", "playwright-report/**", "screenshots/**"] },
];

export default config;
