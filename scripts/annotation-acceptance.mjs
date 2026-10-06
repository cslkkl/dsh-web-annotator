/** Actual existing Browser + packed plugin + patched provider, with a durable replay turn. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import {
  launchReplayFixture,
  readDurableJournal,
  transcriptSnapshot,
} from './harness-replay-test.mjs';

const workspace = resolve('..');
const reply = '已收到内置 Browser 的提问和区域批注。';
const root = resolve('tests/fixtures');
let demo;
let demoUrl;
let fixture;
let browser;
let page;
const checks = [];
const errors = [];
let artifacts = resolve('integration/annotation-artifacts');
const bundledHost = process.env.WEB_ANNOTATOR_BUNDLED_HOST === '1';
if (bundledHost)
  assert.ok(process.env.LAYOUT_CARE_TARBALL, 'Bundled-host proof requires a tarball.');
await mkdir(artifacts, { recursive: true });
function passed(name) {
  checks.push(name);
  console.log(`PASS ${name}`);
}
try {
  fixture = await launchReplayFixture({
    workspace,
    browserProviderRoot:
      bundledHost || process.env.LAYOUT_CARE_PREVIEW_TARBALL
        ? undefined
        : resolve('integration/browser-provider'),
    chatProviderRoot:
      bundledHost || process.env.LAYOUT_CARE_PREVIEW_TARBALL
        ? undefined
        : resolve('integration/chat-provider'),
    layoutProviderRoot:
      bundledHost || process.env.LAYOUT_CARE_PREVIEW_TARBALL
        ? undefined
        : resolve('integration/layout-provider'),
    tarball: process.env.LAYOUT_CARE_TARBALL,
    previewTarball: process.env.LAYOUT_CARE_PREVIEW_TARBALL,
    responses: [reply, '图片批注已收到。', '图片和定位资料已收到。', '普通消息已收到。'],
  });
  const installedRoot = process.env.LAYOUT_CARE_TARBALL
    ? resolve(
        createRequire(join(fixture.profileRoot, 'package.json')).resolve(
          'dsh-web-annotator/package.json',
        ),
        '..',
      )
    : resolve('.');
  const { webAnnotator } = await import(pathToFileURL(join(installedRoot, 'lib/vite.js')).href);
  demo = await createServer({
    configFile: false,
    root,
    plugins: [webAnnotator()],
    server: { host: '127.0.0.1', port: 0 },
  });
  await demo.listen();
  demoUrl = `${demo.resolvedUrls.local[0]}annotation-page.html`;
  const servedBridge = await (await fetch(new URL('__layout-care__/bridge.js', demoUrl))).text();
  assert.equal(servedBridge, await readFile(join(installedRoot, 'lib/bridge.js'), 'utf8'));
  browser = await chromium.launch({
    channel: process.env.LAYOUT_CARE_BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.clock.install();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await fixture.api.rpc('workspace/create', { request: { path: root } });
  await page.goto(fixture.launchUrl);
  const boot = await page.evaluate(() => window.__DSH_BOOT__);
  await writeFile(join(artifacts, 'boot-structure.txt'), Object.keys(boot || {}).join('\n'));
  const button = (name) => page.getByRole('button', { name, exact: true });
  await button('选择工作区').waitFor();
  await button('继续').click();
  await button('继续').waitFor({ state: 'hidden' });
  if (await button('稍后配置').isVisible()) await button('稍后配置').click();
  await button('选择工作区').click();
  await page.getByText(basename(root), { exact: true }).last().click();
  await button('批注网页').click();
  const address = page.getByRole('textbox', { name: /URL|网址|地址/ }).last();
  await address.fill(demoUrl);
  await address.press('Enter');
  const frameElement = page.locator('iframe[data-sidebar-browser-frame="iframe"]');
  await frameElement.waitFor();
  const frame = page.frameLocator('iframe[data-sidebar-browser-frame="iframe"]');
  await frame.locator('#heading').waitFor();
  await button('添加批注').waitFor();
  const annotateBox = await button('添加批注').boundingBox();
  const reloadBox = await button('刷新').boundingBox();
  assert.ok(annotateBox && reloadBox && annotateBox.x + annotateBox.width <= reloadBox.x + 1);
  assert.equal(await button('添加批注').innerText(), '批注网页');
  passed('Controls mounted inside the original Browser tab');
  const verifyFullscreen = async (phase) => {
    const mainDraft = page.locator('[data-composer-card] [contenteditable="true"]').first();
    await mainDraft.fill('全屏切换后保留的草稿');
    const original = await mainDraft.elementHandle();
    for (const glass of [false, true]) {
      // Use only the installed wallpaper's stacking boundary, not a substitute shell.
      const skin = glass
        ? await page.addStyleTag({
            content: `[data-sidebar-right-panel][data-sidebar-right-open] {
          backdrop-filter: blur(16px) saturate(1.8) brightness(1.04) contrast(1.01);
          background-color: color-mix(in srgb, #ffffff 20%, transparent);
        }`,
          })
        : undefined;
      await button('全屏').click();
      await page.locator('[data-rightbar-fullscreen]').waitFor();
      const result = await mainDraft.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        el.focus();
        return {
          browser: hit?.getAttribute('data-sidebar-browser-frame'),
          visibility: getComputedStyle(el).visibility,
          focused: document.activeElement === el,
        };
      });
      assert.equal(
        result.browser,
        'iframe',
        `${phase}: fullscreen owns hits over the covered composer (glass=${glass})`,
      );
      assert.equal(result.visibility, 'hidden');
      assert.equal(result.focused, false, 'Covered main input is inert');
      await frame.getByRole('textbox', { name: '网页输入框' }).fill('全屏网页可操作');
      assert.equal(
        await frame.getByRole('textbox', { name: '网页输入框' }).inputValue(),
        '全屏网页可操作',
      );
      if (glass) await page.screenshot({ path: join(artifacts, `fullscreen-${phase}-glass.png`) });
      await button('退出全屏').click();
      await page.locator('[data-rightbar-fullscreen]').waitFor({ state: 'detached' });
      assert.equal(await mainDraft.innerText(), '全屏切换后保留的草稿');
      assert.equal(await mainDraft.evaluate((el, previous) => el === previous, original), true);
      assert.equal(await mainDraft.isVisible(), true);
      await skin?.evaluate((el) => el.remove());
    }
    await mainDraft.fill('');
    await frame.getByRole('textbox', { name: '网页输入框' }).fill('');
    await original.dispose();
    passed(
      `Fullscreen covers ${phase} chat with and without glass, accepts page input, and restores the same draft`,
    );
  };
  await verifyFullscreen('hero');
  const start = async () => {
    await button('添加批注').click();
    await frame.locator('[data-dsh-page-annotation]').waitFor();
  };
  const note = frame.getByRole('textbox', { name: '添加评论…' });
  const optionsButton = frame.getByRole('button', { name: '批注选项', exact: true });
  const save = async (text) => {
    await note.fill(text);
    await frame
      .getByRole('button', { name: '保存批注', exact: true })
      .filter({ visible: true })
      .click();
    await frame.locator('[data-dsh-page-annotation]').waitFor({ state: 'detached' });
    await page.getByText(text, { exact: true }).waitFor();
  };
  const box = async (id) => {
    const b = await frame.locator(id).boundingBox();
    assert.ok(b);
    return b;
  };
  const clickAt = async (id) => {
    const b = await box(id);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };

  await start();
  await clickAt('#counter');
  await note.waitFor();
  const composer = frame.getByRole('form', { name: '添加评论…', exact: true });
  const compact = await composer.boundingBox();
  assert.ok(compact && compact.height <= 52, 'Empty editor uses one compact row');
  assert.equal(await frame.getByRole('combobox').isVisible(), false);
  assert.equal(
    await frame.getByRole('button', { name: '保存批注', exact: true }).isDisabled(),
    true,
  );
  await composer.screenshot({ path: join(artifacts, 'composer-light.png') });
  assert.equal(await frame.locator('#counter').innerText(), '点击次数：0');
  await note.pressSequentially('这个按钮 为什么这样设计');
  assert.equal(await note.inputValue(), '这个按钮 为什么这样设计');
  await note.press('Shift+Enter');
  await note.pressSequentially('补充说明');
  assert.match(await note.inputValue(), /\n补充说明$/);
  assert.ok((await composer.boundingBox()).height > compact.height);
  await note.fill('这个按钮为什么这样设计？');
  await page.clock.fastForward(130000);
  assert.equal(await note.isVisible(), true, 'Long drafting keeps the annotation editor open');
  assert.equal(await note.inputValue(), '这个按钮为什么这样设计？');
  passed('Drafts remain editable beyond two minutes and can still be saved or cancelled');
  await optionsButton.click();
  const optionsPanel = frame.getByRole('dialog', { name: '批注选项', exact: true });
  const panelBounds = await optionsPanel.boundingBox();
  const ownerBounds = await frameElement.boundingBox();
  assert.ok(panelBounds && ownerBounds);
  assert.ok(panelBounds.x >= ownerBounds.x && panelBounds.y >= ownerBounds.y);
  assert.ok(panelBounds.x + panelBounds.width <= ownerBounds.x + ownerBounds.width);
  assert.ok(panelBounds.y + panelBounds.height <= ownerBounds.y + ownerBounds.height);
  const colorField = optionsPanel.getByRole('textbox', { name: '文本颜色', exact: true });
  await colorField.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 229,
    isComposing: true,
  });
  assert.equal(
    await optionsPanel.getByRole('textbox', { name: '文本颜色', exact: true }).inputValue(),
    await frame.locator('#counter').evaluate((el) => getComputedStyle(el).color),
  );
  await composer.screenshot({ path: join(artifacts, 'expanded-light.png') });
  await page.keyboard.press('Escape');
  assert.equal(await optionsPanel.isVisible(), false);
  assert.equal(await note.isVisible(), true);
  await optionsButton.click();
  await clickAt('#heading');
  assert.equal(await optionsPanel.isVisible(), false);
  assert.equal(await note.inputValue(), '这个按钮为什么这样设计？');
  await optionsButton.click();
  await optionsPanel.getByRole('textbox', { name: '字号', exact: true }).fill('18');
  await optionsPanel.getByRole('textbox', { name: '文本颜色', exact: true }).fill('not-a-color');
  await composer
    .getByRole('button', { name: '保存批注', exact: true })
    .filter({ visible: true })
    .click();
  await composer.getByRole('alert').waitFor();
  await optionsPanel
    .getByRole('textbox', { name: '文本颜色', exact: true })
    .fill('rgb(37, 39, 38)');
  assert.equal(
    await frame.locator('#counter').evaluate((el) => getComputedStyle(el).fontSize),
    '16px',
  );
  await page.keyboard.press('Escape');
  passed(
    'Compact editor grows for newlines; options fit the viewport and dismiss without losing the note',
  );
  await page.screenshot({ path: join(artifacts, 'element-light.png') });
  await save('这个按钮为什么这样设计？');
  passed(
    'Precise element click opens local editor without activating the page; spaces type normally',
  );

  await start();
  await page.keyboard.down('Space');
  await clickAt('#counter');
  assert.equal(await frame.locator('#counter').innerText(), '点击次数：1');
  await page.keyboard.up('Space');
  await clickAt('#counter');
  await note.waitFor();
  assert.equal(await frame.locator('#counter').innerText(), '点击次数：1');
  await optionsButton.click();
  await frame.getByRole('button', { name: '取消', exact: true }).click();
  passed('Hold Space allows page clicks; releasing Space restores annotation');

  await start();
  const region = await box('#card');
  const startX = region.x + 10,
    startY = region.y + 10,
    endX = region.x + Math.min(240, region.width - 20),
    endY = region.y + 110;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();
  await note.waitFor();
  await note.fill('把框选区域的间距加大一点');
  await optionsButton.click();
  await frame.getByRole('combobox').selectOption('comment');
  assert.equal(await frame.getByRole('combobox').isVisible(), false);
  await page.screenshot({ path: join(artifacts, 'region-light.png') });
  await save('把框选区域的间距加大一点');
  await button('预览发送内容').click();
  const prompt = await page.getByRole('textbox', { name: '发送内容', exact: true }).inputValue();
  const regionMatch = prompt.match(/"kind": "region",[\s\S]*?"rect": (\{[\s\S]*?\})/);
  assert.ok(regionMatch);
  const actual = JSON.parse(regionMatch[1]);
  assert.ok(Math.abs(actual.width - (endX - startX)) <= 1);
  assert.ok(Math.abs(actual.height - (endY - startY)) <= 1);
  assert.match(prompt, /提问请回答问题/);
  assert.match(prompt, /"after": "18px"/);
  passed('Drag keeps exact rectangle and separates question/comment intents');

  await start();
  const frameBounds = await frameElement.boundingBox();
  await page.mouse.click(frameBounds.x + frameBounds.width - 8, frameBounds.y + 85);
  await note.waitFor();
  await save('空白位置需要留白吗？');
  // Explicit blank div is a DOM element; delete it to exercise a true body point.
  await frame.locator('#blank').evaluate((el) => el.remove());
  await start();
  await page.mouse.click(frameBounds.x + frameBounds.width - 8, frameBounds.y + 90);
  await note.waitFor();
  await save('这个空白位置放一个提示');
  await button('预览发送内容').click();
  await button('预览发送内容').click();
  assert.match(
    await page.getByRole('textbox', { name: '发送内容', exact: true }).inputValue(),
    /"kind": "point"/,
  );
  passed('Clicks on actual page whitespace retain a point annotation');

  await start();
  await page.keyboard.press('Escape');
  await frame.locator('[data-dsh-page-annotation]').waitFor({ state: 'detached' });
  await start();
  await page.keyboard.down('Space');
  await page.mouse.wheel(0, 520);
  await page.keyboard.up('Space');
  // Scroll the controlled document to its open shadow host, then select through the overlay.
  await frame.locator('#shadow-host').evaluate((el) => el.scrollIntoView());
  await clickAt('#inside');
  await note.waitFor();
  await save('Shadow DOM 元素的样式在哪里？');
  await button('预览发送内容').click();
  await button('预览发送内容').click();
  assert.match(
    await page.getByRole('textbox', { name: '发送内容', exact: true }).inputValue(),
    /"shadowHosts": \[\s*"#shadow-host"/,
  );
  passed('Escape cleans up, scrolling works, and open Shadow DOM has a precise locator');

  await frame.locator('body').evaluate(() => scrollTo(0, 0));
  await page.locator('body').evaluate((el) => el.setAttribute('data-ds-dark-theme', 'true'));
  await start();
  await clickAt('#heading');
  await composer.screenshot({ path: join(artifacts, 'composer-dark.png') });
  await optionsButton.click();
  await composer.screenshot({ path: join(artifacts, 'expanded-dark.png') });
  await page.keyboard.press('Escape');
  await note.fill('深色模式批注预览');
  await page.screenshot({ path: join(artifacts, 'element-dark.png') });
  await page.keyboard.press('Escape');
  await page.locator('body').evaluate((el) => el.removeAttribute('data-ds-dark-theme'));
  passed('Light and dark annotation screenshots captured');

  // Navigation isolates retained queues, and restores them when returning.
  await address.fill(demoUrl + '?other-page=1');
  await address.press('Enter');
  await frame.locator('#heading').waitFor();
  await page.getByRole('region', { name: '页面批注', exact: true }).waitFor({ state: 'hidden' });
  await address.fill(demoUrl);
  await address.press('Enter');
  await page.getByText('这个按钮为什么这样设计？', { exact: true }).waitFor();
  await button('预览发送内容').click();
  passed('Complete page URL isolation and retained queue after reload');

  await page.route('**/api/session/prompt', (route) => route.abort());
  await button('发送到当前会话').click();
  await page.getByRole('alert').filter({ hasText: '操作失败，批注已保留' }).waitFor();
  assert.equal(await page.getByText('这个按钮为什么这样设计？', { exact: true }).count(), 1);
  await page.unroute('**/api/session/prompt');
  // A deliberately aborted network request logs an expected browser transport error.
  const unexpected = errors.filter((x) => !x.includes('net::ERR_FAILED'));
  errors.splice(0, errors.length, ...unexpected);
  passed('Failed submission retains all notes for retry');

  const finalPrompt = await page
    .getByRole('textbox', { name: '发送内容', exact: true })
    .inputValue();
  const beforeSessions = await fixture.api.listSessions();
  await button('发送到当前会话').click();
  await page.getByText(reply, { exact: true }).waitFor({ timeout: 30000 });
  let journal;
  for (const { sessionId } of beforeSessions.items) {
    const item = await readDurableJournal(fixture, sessionId);
    if (
      item &&
      transcriptSnapshot(item.events).some(
        (entry) => entry.role === 'user' && entry.text === finalPrompt,
      )
    )
      journal = item;
  }
  assert.ok(journal, 'Exactly the previewed prompt reaches a durable session');
  const transcript = transcriptSnapshot(journal.events);
  assert.equal(transcript.filter((x) => x.role === 'user' && x.text === finalPrompt).length, 1);
  await writeFile(join(artifacts, 'sent-request.txt'), finalPrompt + '\n');
  await writeFile(join(artifacts, 'transcript.json'), JSON.stringify(transcript, null, 2));
  passed('Actual Client submission reaches the official replay adapter and exact durable journal');
  const evidence = page.locator('.lc-message-evidence');
  assert.equal(await evidence.getAttribute('open'), null);
  assert.equal(await page.getByText('逐条处理用户输入', { exact: false }).isVisible(), false);
  await evidence.locator('summary').click();
  assert.equal(await evidence.locator('pre').innerText(), finalPrompt);
  await evidence.locator('summary').click();
  await page.screenshot({ path: join(artifacts, 'message-collapsed.png') });
  await page.reload();
  await page.getByText(reply, { exact: true }).waitFor();
  assert.equal(await page.locator('.lc-message-evidence').getAttribute('open'), null);
  passed(
    'Detailed user messages stay compact, expand on demand, and survive a real session reload',
  );

  // Exercise the actual attachment path with a real viewport capture; only the native capture boundary is substituted.
  const shotModule = await build({
    entryPoints: ['src/browser/screenshot.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'WebAnnotatorScreenshot',
    platform: 'browser',
    write: false,
  });
  await button('批注网页').first().click();
  await address.fill(demoUrl);
  await address.press('Enter');
  await frame.locator('#heading').waitFor();
  const viewportCapture = await frameElement.screenshot();
  await frame.locator('body').evaluate(
    async (_body, { script, capture }) => {
      window.WebAnnotatorScreenshot = new Function(script + '; return WebAnnotatorScreenshot;')();
      const rect = document.querySelector('#heading').getBoundingClientRect();
      const screenshot = await window.WebAnnotatorScreenshot.markScreenshot(capture, {
        viewport: { width: innerWidth, height: innerHeight },
        selection: {
          kind: 'element',
          viewportRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        },
      });
      const send = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function (value, transfer) {
        if (value?.selection && value?.note) {
          send.call(this, { ...value, screenshot }, transfer);
        } else send.call(this, value, transfer);
      };
    },
    {
      script: shotModule.outputFiles[0].text,
      capture: 'data:image/png;base64,' + viewportCapture.toString('base64'),
    },
  );
  await start();
  await clickAt('#heading');
  await save('这块标题再醒目一点');
  assert.equal(
    await page.getByRole('combobox', { name: '发送方式', exact: true }).inputValue(),
    'image',
  );
  await button('预览发送内容').click();
  const imagePrompt = await page
    .getByRole('textbox', { name: '发送内容', exact: true })
    .inputValue();
  assert.doesNotMatch(imagePrompt, /"selection"|"viewport"|"candidates"/);
  await page
    .locator('.lc-image-preview')
    .screenshot({ path: join(artifacts, 'image-preview.png') });
  await button('发送到当前会话').click();
  await page.getByText('图片批注已收到。', { exact: true }).waitFor();
  const sessionsAfterImages = await fixture.api.listSessions();
  let admittedImage;
  let targetSession;
  for (const { sessionId } of sessionsAfterImages.items) {
    const item = await readDurableJournal(fixture, sessionId);
    admittedImage = item?.events.find(
      (event) =>
        event.type === 'user/message' &&
        event.data.content.some((part) => part.type === 'text' && part.text === imagePrompt),
    );
    if (admittedImage) {
      targetSession = sessionId;
      break;
    }
  }
  assert.ok(admittedImage);
  const imagePart = admittedImage.data.content.find((part) => part.type === 'image');
  assert.ok(imagePart?.attachment?.attachmentId);
  assert.equal(imagePart.attachment.mediaType, 'image/jpeg');
  assert.ok(imagePart.attachment.bytes > 1000);
  assert.equal(admittedImage.data.content.filter((part) => part.type === 'image').length, 1);
  passed(
    'Image mode uploads actual marked pixels through official admission and durable image references',
  );

  await start();
  await clickAt('#heading');
  await save('图片与定位资料一起发送');
  await page.getByRole('combobox', { name: '发送方式', exact: true }).selectOption('both');
  await button('发送到当前会话').click();
  await page.getByText('图片和定位资料已收到。', { exact: true }).waitFor();
  assert.equal(await page.locator('.lc-message-evidence').last().getAttribute('open'), null);
  await page.screenshot({ path: join(artifacts, 'image-submitted.png') });
  passed('Combined mode keeps real image attachments and collapses DOM evidence');
  assert.ok(targetSession);
  await fixture.api.sendPrompt(targetSession, '普通用户消息');
  await page.getByText('普通用户消息', { exact: true }).waitFor();
  await page.getByText('普通消息已收到。', { exact: true }).waitFor();
  passed('The additive text chain retains ordinary user message rendering');
  await verifyFullscreen('active');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: join(artifacts, 'submitted.png') });
  await writeFile(
    join(artifacts, 'report.json'),
    JSON.stringify(
      {
        checks,
        errors,
        runtime: fixture.runtime,
        target: '0.2.0-rc.2 + bundled Browser, Chat and Layout extensions',
        desktopNative: 'unverified',
        modelSourceEdits: 'unverified',
        screenshotAttachments: true,
        nativeCapture: 'unverified; Web test replaces only the Electron capture boundary',
        packagedPlugin: !!process.env.LAYOUT_CARE_TARBALL,
        packagedProviders: bundledHost || !!process.env.LAYOUT_CARE_PREVIEW_TARBALL,
        singlePackageInstall: bundledHost && !process.env.LAYOUT_CARE_PREVIEW_TARBALL,
        previewTarballSha256: process.env.LAYOUT_CARE_PREVIEW_TARBALL
          ? createHash('sha256')
              .update(await readFile(process.env.LAYOUT_CARE_PREVIEW_TARBALL))
              .digest('hex')
          : undefined,
        tarballSha256: process.env.LAYOUT_CARE_TARBALL
          ? createHash('sha256')
              .update(await readFile(process.env.LAYOUT_CARE_TARBALL))
              .digest('hex')
          : undefined,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (fixture) await writeFile(join(artifacts, 'harness.log'), fixture.getLogs());
  if (page) {
    await page.screenshot({ path: join(artifacts, 'failure.png') });
    console.error((await page.locator('body').innerText()).slice(-3200));
  }
  console.error('Browser errors:', errors);
  throw error;
} finally {
  await browser?.close();
  await fixture?.stop();
  await demo?.close();
}
