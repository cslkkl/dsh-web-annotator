/** Real Chromium/IndexedDB regressions for large screenshot queues, migration and write failures. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';

const script = await build({
  entryPoints: ['src/client/annotation-store.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'AnnotationStoreTest',
  platform: 'browser',
  write: false,
});
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Isolated annotation storage test</title>');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
const checks = [];
try {
  browser = await chromium.launch({
    channel: process.env.WEB_ANNOTATOR_BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ content: script.outputFiles[0].text });
  const ready = async (key) =>
    page.waitForFunction((name) => window[name].getSnapshot().storage === 'saved', key);
  await page.evaluate(() => {
    window.annotation = {
      intent: 'question',
      note: '保留完整截图',
      url: location.href,
      title: 'Storage regression',
      viewport: { width: 1600, height: 1600 },
      selection: {
        kind: 'point',
        rect: { x: 20, y: 20, width: 0, height: 0 },
        viewportRect: { x: 20, y: 20, width: 0, height: 0 },
        scroll: { x: 0, y: 0 },
        candidates: [],
      },
    };
    window.legacyKey = 'dsh.layout-care.browser-annotations.v1.migration';
    localStorage.setItem(
      legacyKey,
      JSON.stringify({ byUrl: { [annotation.url]: [{ id: 'legacy', annotation }] } }),
    );
    window.migrated = AnnotationStoreTest.createAnnotationStore().create('migration');
  });
  await ready('migrated');
  assert.equal(
    await page.evaluate(() => migrated.getSnapshot().byUrl[annotation.url][0].id),
    'legacy',
  );
  assert.equal(await page.evaluate(() => localStorage.getItem(legacyKey)), null);
  checks.push('Legacy session queues migrate only after an IndexedDB commit');

  const size = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(1600, 1600);
    let seed = 12345;
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        seed = (Math.imul(1664525, seed) + 1013904223) | 0;
        pixels.data[i + channel] = seed >>> 24;
      }
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    window.picture = {
      ...annotation,
      screenshot: {
        mediaType: 'image/jpeg',
        data: canvas.toDataURL('image/jpeg', 0.9).split(',')[1],
        width: 1600,
        height: 1600,
      },
    };
    const value = JSON.stringify({
      byUrl: {
        [annotation.url]: Array.from({ length: 3 }, (_, i) => ({
          id: `large-${i}`,
          annotation: picture,
        })),
      },
    });
    let legacyRejected = false;
    try {
      localStorage.setItem('quota-reproduction', value);
    } catch (error) {
      legacyRejected = error.name === 'QuotaExceededError';
    }
    window.large = AnnotationStoreTest.createAnnotationStore().create('large');
    return { bytes: value.length, imageCharacters: picture.screenshot.data.length, legacyRejected };
  });
  assert.ok(
    size.bytes > 6_000_000 && size.imageCharacters <= 4_000_000 && size.legacyRejected,
    JSON.stringify(size),
  );
  await ready('large');
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++)
      large.actions.add(annotation.url, { id: `large-${i}`, annotation: picture });
    large.actions.edit(annotation.url, 'large-1', '保存后修改的批注');
    window.originalImage = picture.screenshot.data;
  });
  await ready('large');
  await page.evaluate(() => {
    window.reloaded = AnnotationStoreTest.createAnnotationStore().create('large');
    window.other = AnnotationStoreTest.createAnnotationStore().create('other');
  });
  await ready('reloaded');
  await ready('other');
  assert.deepEqual(
    await page.evaluate(() => {
      const notes = reloaded.getSnapshot().byUrl[annotation.url];
      return {
        count: notes.length,
        imagesMatch: notes.every((item) => item.annotation.screenshot.data === originalImage),
        text: notes[1].annotation.note,
        otherCount: Object.keys(other.getSnapshot().byUrl).length,
      };
    }),
    { count: 3, imagesMatch: true, text: '保存后修改的批注', otherCount: 0 },
  );
  checks.push(
    'A real JPEG queue exceeding the old quota reloads with exact images, edits and session isolation',
  );

  await page.evaluate(() => {
    window.transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === 'readwrite')
        throw new DOMException('Test-only denied write', 'QuotaExceededError');
      return transaction.apply(this, args);
    };
    reloaded.actions.edit(annotation.url, 'large-0', '存储失败仍保留内容');
  });
  await page.waitForFunction(() => reloaded.getSnapshot().storage === 'failed');
  assert.equal(
    await page.evaluate(() => reloaded.getSnapshot().byUrl[annotation.url][0].annotation.note),
    '存储失败仍保留内容',
  );
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = transaction;
    reloaded.actions.edit(annotation.url, 'large-0', '恢复后成功保存');
  });
  await ready('reloaded');
  await page.evaluate(() => {
    reloaded.actions.sent(annotation.url, ['large-0', 'large-1']);
    reloaded.actions.add(annotation.url, { id: 'later', annotation });
  });
  await ready('reloaded');
  await page.evaluate(() => {
    window.final = AnnotationStoreTest.createAnnotationStore().create('large');
  });
  await ready('final');
  assert.deepEqual(
    await page.evaluate(() => final.getSnapshot().byUrl[annotation.url].map((item) => item.id)),
    ['large-2', 'later'],
  );
  checks.push(
    'Failed writes preserve live notes, retry succeeds, and sending clears only captured IDs',
  );

  await page.evaluate(() => {
    final.clearPersisted();
  });
  // Re-opening the database waits for the queued delete transaction before checking it.
  await page.waitForFunction(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dsh-web-annotator', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve) => {
        const request = db
          .transaction('queues')
          .objectStore('queues')
          .get('dsh.layout-care.browser-annotations.v1.large');
        request.onsuccess = () => resolve(request.result === undefined);
      });
    } finally {
      db.close();
    }
  });
  checks.push('Explicit persisted-queue removal deletes the session record');
  assert.deepEqual(errors, []);
  await mkdir('integration', { recursive: true });
  await writeFile(
    'integration/storage-verification.json',
    JSON.stringify({ checks, size, errors }, null, 2) + '\n',
  );
  for (const check of checks) console.log(`PASS ${check}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
