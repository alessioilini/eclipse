// DOM matchers and RTL cleanup are only needed (and only loaded) in jsdom test files.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  const { afterEach } = await import('vitest');
  afterEach(() => cleanup());
}

export {};
