/** DSH Web Annotator adds annotation controls to Harness's existing Browser slots. */
import { useEffect, useRef, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { Button, IconInspectOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '../browser/slots';
import {
  annotationPrompt,
  annotationImagePrompt,
  readAnnotationPrompt,
  type AnnotationDelivery,
} from '../browser/prompt';
import type {
  BrowserAnnotation,
  BrowserAnnotationImage,
  BrowserAnnotationOptions,
} from '../browser/page-inspector';
import { en, zh } from './annotation-copy';
import type { AnnotationCopyKey } from './annotation-copy';
import { createAnnotationStore, readAnnotations, type AnnotationStore } from './annotation-store';

const NS = 'webAnnotatorAnnotations';
/** Browser slots and the current Session submission service. */
export const inject = ['slots', 'locale', 'sessions', 'sidebarRight'];
type Shared = PropsStore<AnnotationStore> & PropsLocale<typeof NS>;
type ToolbarProps = PropsRuntime<'sidebar.right.tab.browser.toolbar'> & Shared;
type QueueProps = PropsRuntime<'sidebar.right.tab.browser.annotations'> &
  Shared & {
    submitAnnotations: (text: string, images: readonly BrowserAnnotationImage[]) => Promise<void>;
  };
const css = `.wa-annotations{flex:none;border-top:.5px solid var(--dsw-alias-border-l3);padding:8px 10px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);max-height:40%;overflow:auto}.wa-annotations summary{cursor:pointer;font-weight:500}.wa-annotations p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.wa-note{display:flex;gap:8px;align-items:start;border-bottom:.5px solid var(--dsw-alias-border-l3);padding:8px 0}.wa-note>div{flex:1;min-width:0;overflow-wrap:anywhere}.wa-muted{color:var(--dsw-alias-label-secondary)}.wa-actions{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}.wa-preview{width:100%;min-height:140px;max-height:260px;resize:vertical;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);padding:8px;box-sizing:border-box;font:var(--dsw-font-xxs-12)}.wa-feedback{padding:8px 10px;flex:none;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);overflow-wrap:anywhere}.wa-error{color:var(--dsw-alias-state-error-primary)}`;

function AnnotationMessage({
  matched,
  text,
  t,
}: PropsRuntime<'conversation.message.user-text'> &
  PropsLocale<typeof NS> & { matched: readonly BrowserAnnotation[] }) {
  return (
    <div className="wa-message">
      <style>{messageCss}</style>
      {matched.map((note, i) => (
        <div className="wa-message-note" key={i}>
          {matched.length > 1 && (
            <span className="wa-muted">
              {i + 1}. {t(note.intent)}
            </span>
          )}
          <p>{note.note}</p>
          {note.styleChanges && (
            <p className="wa-muted">
              {Object.entries(note.styleChanges)
                .map(([key, value]) => `${key}: ${value.after}`)
                .join(' · ')}
            </p>
          )}
        </div>
      ))}
      <details className="wa-message-evidence">
        <summary>
          {t('evidence')} · {matched.length}
        </summary>
        <pre>{text}</pre>
      </details>
    </div>
  );
}
const messageCss = `.wa-message p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.wa-message-note+.wa-message-note{margin-top:10px}.wa-message-evidence{margin-top:10px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}.wa-message-evidence summary{cursor:pointer;user-select:none}.wa-message-evidence pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;padding:8px 0}.wa-delivery{display:flex;align-items:center;gap:6px}.wa-delivery select{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);padding:4px;font:inherit}.wa-image-preview{display:block;width:100%;max-height:240px;object-fit:contain;border-radius:var(--dsw-radius-sm);margin:8px 0}`;

function readableError(error: unknown): AnnotationCopyKey {
  const code = error instanceof Error ? error.message : '';
  return code === 'annotation-unavailable'
    ? 'unavailable'
    : code === 'annotation-timeout'
      ? 'timeout'
      : code === 'annotation-page-changed'
        ? 'pageChanged'
        : code === 'annotation-limit'
          ? 'limit'
          : 'failed';
}
function pickerOptions(t: ToolbarProps['t']): BrowserAnnotationOptions {
  const keys = [
    'select',
    'comment',
    'question',
    'placeholder',
    'settings',
    'save',
    'cancel',
    'parent',
    'child',
    'targetGone',
    'empty',
    'region',
    'point',
    'interact',
    'color',
    'background',
    'opacity',
    'font',
    'fontSize',
    'fontWeight',
    'spacing',
    'elementOnly',
    'invalidStyle',
    'applyStyles',
    'styleHint',
  ] as const;
  const copy = Object.fromEntries(
    keys.map((key) => [key, t(key)]),
  ) as BrowserAnnotationOptions['copy'];
  return {
    intent: 'question',
    dark: document.body.getAttribute('data-ds-dark-theme') === 'true',
    copy,
  };
}
function Toolbar({
  annotate,
  cancelAnnotation,
  url,
  tabId,
  loading,
  useStore,
  actions,
  t,
}: ToolbarProps) {
  const storage = useStore((state) => state.storage);
  const stored = useStore((state) => state.byUrl?.[url || '']);
  const full = readAnnotations(stored).length >= 32;
  const [active, setActive] = useState(false);
  const [error, setError] = useState<AnnotationCopyKey>();
  const epoch = useRef(0);
  useEffect(() => {
    setActive(false);
    setError(undefined);
    return () => {
      epoch.current++;
      cancelAnnotation();
    };
  }, [url, tabId, cancelAnnotation]);
  async function start() {
    if (active) {
      cancelAnnotation();
      return;
    }
    if (readAnnotations(stored).length >= 32) {
      setError('limit');
      return;
    }
    const generation = epoch.current;
    setActive(true);
    setError(undefined);
    try {
      const result = await annotate(pickerOptions(t));
      if (epoch.current !== generation || 'cancelled' in result) return;
      actions.add(result.url, { id: crypto.randomUUID(), annotation: result });
    } catch (failure) {
      if (epoch.current === generation) setError(readableError(failure));
    } finally {
      if (epoch.current === generation) setActive(false);
    }
  }
  return (
    <>
      <Tooltip label={t(full ? 'limit' : active ? 'stop' : 'start')} side="bottom">
        <Button
          type="button"
          size="sm"
          variant="toolbar"
          icon={<IconInspectOutlineRegular />}
          aria-label={t(active ? 'stop' : 'start')}
          aria-pressed={active}
          disabled={!url || loading || storage === 'loading' || (!active && full)}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          onClick={() => {
            void start();
          }}
        >
          {t(active ? 'stop' : 'openBrowser')}
        </Button>
      </Tooltip>
      {error && (
        <Tooltip label={t(error)} side="bottom">
          <span role="alert" aria-label={t(error)} className="wa-error">
            !
          </span>
        </Tooltip>
      )}
    </>
  );
}
function Queue(props: QueueProps) {
  const { url, useStore, actions, t, submitAnnotations } = props;
  const stored = useStore((state) => state.byUrl?.[url || '']);
  const notes = readAnnotations(stored).filter((item) => item.annotation.url === url);
  const storage = useStore((state) => state.storage);
  const [editing, setEditing] = useState<{ id: string; text: string }>();
  const [excluded, setExcluded] = useState<string[]>([]);
  const selectedNotes = notes.filter((item) => !excluded.includes(item.id));
  const [preview, setPreview] = useState(false);
  const [delivery, setDelivery] = useState<AnnotationDelivery>('image');
  const imageCount = selectedNotes.filter(({ annotation }) => !!annotation.screenshot).length;
  const hasImages = selectedNotes.length > 0 && imageCount === selectedNotes.length;
  const effectiveDelivery =
    (delivery === 'both' && imageCount > 0) || hasImages ? delivery : 'details';
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<AnnotationCopyKey>();
  const epoch = useRef(0);
  const sending = useRef(false);
  useEffect(() => {
    setPreview(false);
    setFeedback(undefined);
    setBusy(false);
    setEditing(undefined);
    setExcluded([]);
    return () => {
      epoch.current++;
    };
  }, [url]);
  let prompt = '';
  let tooLarge = false;
  if (selectedNotes.length) {
    try {
      const annotations = selectedNotes.map((x) => x.annotation);
      prompt =
        effectiveDelivery === 'image'
          ? annotationImagePrompt(annotations)
          : annotationPrompt(
              annotations,
              effectiveDelivery === 'both',
              effectiveDelivery === 'both' ? annotations.map((x) => !!x.screenshot) : undefined,
            );
    } catch {
      tooLarge = true;
    }
  }
  async function send() {
    if (!url || !prompt || sending.current) return;
    const generation = epoch.current;
    const capturedUrl = url;
    const ids = selectedNotes.map((x) => x.id);
    sending.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      await submitAnnotations(
        prompt,
        effectiveDelivery === 'details'
          ? []
          : selectedNotes.flatMap((x) =>
              x.annotation.screenshot ? [x.annotation.screenshot] : [],
            ),
      );
      actions.sent(capturedUrl, ids);
      if (epoch.current === generation) setFeedback('sent');
    } catch (error) {
      if (epoch.current === generation) setFeedback(readableError(error));
    } finally {
      sending.current = false;
      if (epoch.current === generation) setBusy(false);
    }
  }
  return (
    <>
      <style>{css + messageCss}</style>
      {!!notes.length && (
        <section className="wa-annotations" aria-label={t('notes')}>
          <details open>
            <summary>
              {t('notes')} · {notes.length}
            </summary>
            {notes.map(({ id, annotation }, index) => (
              <div className="wa-note" key={id}>
                <input
                  type="checkbox"
                  aria-label={`${t('selectNote')} ${index + 1}`}
                  checked={!excluded.includes(id)}
                  disabled={busy}
                  onChange={(event) =>
                    setExcluded(
                      event.target.checked
                        ? excluded.filter((item) => item !== id)
                        : [...excluded, id],
                    )
                  }
                />
                <div>
                  <span className="wa-muted">
                    {t(annotation.intent)} ·{' '}
                    {annotation.selection.kind === 'region'
                      ? t('region')
                      : annotation.selection.kind === 'point'
                        ? t('point')
                        : annotation.selection.candidates[0]?.selector}
                  </span>
                  {editing?.id === id ? (
                    <>
                      <textarea
                        className="wa-preview"
                        aria-label={t('edit')}
                        maxLength={1000}
                        value={editing.text}
                        onChange={(event) => setEditing({ id, text: event.target.value })}
                      />
                      <div className="wa-actions">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!editing.text.trim()}
                          onClick={() => {
                            actions.edit(url!, id, editing.text);
                            setEditing(undefined);
                          }}
                        >
                          {t('save')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="toolbar"
                          onClick={() => setEditing(undefined)}
                        >
                          {t('cancel')}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>{annotation.note}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="toolbar"
                        disabled={busy}
                        onClick={() => setEditing({ id, text: annotation.note })}
                      >
                        {t('edit')}
                      </Button>
                    </>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="toolbar"
                  disabled={busy}
                  onClick={() => {
                    actions.remove(url!, id);
                    if (editing?.id === id) setEditing(undefined);
                  }}
                  aria-label={t('remove')}
                >
                  ×
                </Button>
              </div>
            ))}
            <div className="wa-actions">
              <label className="wa-delivery">
                <span>{t('delivery')}</span>
                <select
                  aria-label={t('delivery')}
                  value={effectiveDelivery}
                  disabled={busy}
                  onChange={(event) => setDelivery(event.target.value as AnnotationDelivery)}
                >
                  <option value="image" disabled={!hasImages}>
                    {t('image')}
                  </option>
                  <option value="details">{t('details')}</option>
                  <option value="both" disabled={!imageCount}>
                    {t('both')}
                  </option>
                </select>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPreview(!preview)}
                disabled={tooLarge || !selectedNotes.length}
              >
                {t('preview')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={busy || tooLarge || !!editing || !selectedNotes.length}
                onClick={() => {
                  void send();
                }}
              >
                {t('send')}
              </Button>
            </div>
            {preview && (
              <>
                {effectiveDelivery !== 'details' &&
                  selectedNotes
                    .filter(({ annotation }) => annotation.screenshot)
                    .map(({ id, annotation }) => (
                      <img
                        key={id}
                        className="wa-image-preview"
                        alt={t('image')}
                        src={`data:image/jpeg;base64,${annotation.screenshot!.data}`}
                      />
                    ))}
                <textarea className="wa-preview" readOnly aria-label={t('queue')} value={prompt} />
              </>
            )}
            {!!selectedNotes.length && !hasImages && <p className="wa-muted">{t('noImage')}</p>}
            {(tooLarge || notes.length >= 32) && (
              <p role="alert" className="wa-error">
                {t('limit')}
              </p>
            )}
          </details>
        </section>
      )}
      {notes.length > 0 && (storage === 'saving' || storage === 'failed') && (
        <div
          role={storage === 'failed' ? 'alert' : 'status'}
          className={`wa-feedback ${storage === 'failed' ? 'wa-error' : ''}`}
        >
          {t(storage === 'failed' ? 'storageFailed' : 'saving')}
        </div>
      )}
      {feedback && (
        <div
          role={feedback === 'sent' ? 'status' : 'alert'}
          className={`wa-feedback ${feedback === 'sent' ? '' : 'wa-error'}`}
        >
          {t(feedback)}
        </div>
      )}
    </>
  );
}
/** Register reversible contributions to Browser's existing toolbar and review slots.
 * @param ctx - Harness Client plugin context.
 */
export function apply(ctx: Context): void {
  const store = createAnnotationStore();
  ctx.effect(() => ctx.locale.register(NS, { en, zh }));
  ctx.effect(() =>
    ctx.slots.inject('conversation.message.user-text', () =>
      ctx.slots.register(
        {
          name: 'conversation.message.user-text',
          locale: NS,
          select: ({ text }) => readAnnotationPrompt(text),
        },
        AnnotationMessage,
      ),
    ),
  );
  ctx.effect(() =>
    ctx.slots.inject('conversation.input.left', () =>
      ctx.slots.register(
        { name: 'conversation.input.left', id: 'web-annotator.open-browser', locale: NS },
        ({ t }: PropsRuntime<'conversation.input.left'> & PropsLocale<typeof NS>) => (
          <Button
            type="button"
            size="sm"
            variant="toolbar"
            icon={<IconInspectOutlineRegular />}
            onClick={() => {
              ctx.sidebarRight.openTab('browser');
            }}
          >
            {t('openBrowser')}
          </Button>
        ),
      ),
    ),
  );
  ctx.effect(() =>
    ctx.slots.inject('sidebar.right.tab.browser.toolbar', () =>
      ctx.slots.register(
        {
          name: 'sidebar.right.tab.browser.toolbar',
          id: 'web-annotator.annotate',
          locale: NS,
          store,
        },
        Toolbar,
      ),
    ),
  );
  ctx.effect(() =>
    ctx.slots.inject('sidebar.right.tab.browser.annotations', () =>
      ctx.slots.register(
        {
          name: 'sidebar.right.tab.browser.annotations',
          id: 'web-annotator.annotations',
          locale: NS,
          store,
          inject: (sessionId) => ({
            submitAnnotations: async (text: string, images: readonly BrowserAnnotationImage[]) => {
              const session = ctx.sessions.binding(sessionId)?.session;
              if (!session) throw new Error('annotation-session-gone');
              const submission = session.beginSubmission({
                mode: 'queue',
                text,
                attachments: images.map((picture, i) => ({
                  type: 'image',
                  value: {
                    previewUrl: `data:image/jpeg;base64,${picture.data}`,
                    name: `annotation-${i + 1}.jpg`,
                    width: picture.width,
                    height: picture.height,
                  },
                })),
              });
              const result = await session.prompt(
                [
                  { type: 'text', text },
                  ...images.map((picture, i) => ({
                    type: 'image' as const,
                    mediaType: picture.mediaType,
                    data: picture.data,
                    name: `annotation-${i + 1}.jpg`,
                  })),
                ],
                'queue',
                undefined,
                submission.requestId,
              );
              if (!result.ok) throw result.error;
            },
          }),
        },
        Queue,
      ),
    ),
  );
}
