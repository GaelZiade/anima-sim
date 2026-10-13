import { defineConfig } from 'vitest/config';

// Los tests de Monte Carlo corren miles de combates.
export default defineConfig({ test: { testTimeout: 60_000 } });
