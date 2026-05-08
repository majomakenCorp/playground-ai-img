// Stub for `server-only` so files that mark themselves server-only can run
// under Vitest. The real package throws on the client; in tests we just
// import a no-op.
export {};
