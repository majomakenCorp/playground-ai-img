// Provide non-empty defaults for env vars validated at boot by `src/lib/env.ts`.
// Tests that exercise modules guarded with `import "server-only"` end up
// importing env transitively; without this, the Zod loader throws.
process.env.APP_PASSWORD ??= "test-password";
process.env.AUTH_SECRET ??= "x".repeat(48);
process.env.GEMINI_API_KEY ??= "test-gemini";
process.env.RECRAFT_API_KEY ??= "test-recraft";
process.env.MONGODB_URI ??= "mongodb://localhost:27017/test";
process.env.APP_ORIGIN ??= "http://localhost:3000";
process.env.IMAGES_DIR ??= "./generate-images";

// Silence the noisy console in tests (route handlers log on failure paths
// the tests deliberately exercise). We replace the methods directly rather
// than spying so per-test `vi.restoreAllMocks()` cannot undo them.
const noop = () => {};
console.error = noop;
console.log = noop;
console.warn = noop;
