// DOM matchers, RTL cleanup and the web platform are only needed (and only loaded) in jsdom test files.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  const { afterEach } = await import('vitest');
  afterEach(() => cleanup());
  // У каждого экрана есть платформа: по умолчанию web (тесты подменяют её через setPlatformForTests).
  const { setPlatformForTests } = await import('../platform');
  const { createWebPlatform } = await import('../platform/web');
  setPlatformForTests(createWebPlatform(window));
}

export {};
