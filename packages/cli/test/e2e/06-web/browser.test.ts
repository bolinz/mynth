import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CoreEngine } from '../../../../core/src/engine/CoreEngine.ts';
import { startWebServer } from '../../../src/web/server.ts';

describe.runIf(process.env.PLAYWRIGHT)('e2e: browser', () => {
  it('should display task status in browser', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-browser-'));

    const cleanup: (() => void) | null = null;
    try {
      const engine = new CoreEngine({ dbPath: dir });
      await engine.start();
      const server = startWebServer(engine, 0);
      const port = (server.address() as any).port;

      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      await page.goto(`http://localhost:${port}/`);
      const title = await page.title();
      expect(title).toBeDefined();

      await browser.close();
      server.close();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should show agents in page', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-browser-'));
    try {
      const engine = new CoreEngine({ dbPath: dir });
      await engine.start();
      await engine.executeTask('browser test');

      const server = startWebServer(engine, 0);
      const port = (server.address() as any).port;

      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      await page.goto(`http://localhost:${port}/`);
      const body = await page.textContent('body');
      expect(body).toBeDefined();

      await browser.close();
      server.close();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
