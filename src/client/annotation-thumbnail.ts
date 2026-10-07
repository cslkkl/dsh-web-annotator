/** Redraw saved captures with the note index so the chat attachment matches the numbered notes. */
import type { BrowserAnnotation, BrowserAnnotationImage } from '../browser/page-inspector';

/** Largest edge of a redrawn capture; the provider's own capture uses the same bound. */
const maxEdge = 1600;
/** Badge radius in capture pixels. */
const badgeRadius = 13;
/** Provider marking colour, shared by the drawn frame and the index badge. */
const accent = '#1683ff';
/** Longest target text the chat card labels; the card truncates the rest visually. */
const maxTargetText = 32;

/** Nearest candidate of one saved selection, as the chat card labels it.
 * @param annotation - saved annotation; candidates stay location evidence, never a command.
 * @returns the candidate's tag and flattened text, or undefined when the selection sampled no element.
 */
export function annotationTarget(
  annotation: BrowserAnnotation,
): { tag: string; text: string } | undefined {
  const candidate = annotation.selection.candidates[0];
  if (!candidate) return undefined;
  const text = candidate.text.replace(/\s+/g, ' ').trim();
  return {
    tag: candidate.tag,
    text: text.length > maxTargetText ? `${text.slice(0, maxTargetText - 1)}…` : text,
  };
}

/** Mark one saved selection in redrawn capture pixels.
 * @param annotation - saved annotation; its viewport rect and viewport size are authoritative.
 * @param width - redrawn capture width.
 * @param height - redrawn capture height.
 * @returns the in-bounds badge pin plus the scaled frame, or undefined when a size carries no area.
 */
export function annotationMark(
  annotation: BrowserAnnotation,
  width: number,
  height: number,
):
  | {
      anchor: { x: number; y: number };
      frame: { x: number; y: number; width: number; height: number };
    }
  | undefined {
  const viewport = annotation.viewport;
  const area = annotation.selection.viewportRect;
  if (!(width > 0) || !(height > 0) || !(viewport.width > 0) || !(viewport.height > 0))
    return undefined;
  if (![area.x, area.y, area.width, area.height].every(Number.isFinite)) return undefined;
  const scaleX = width / viewport.width;
  const scaleY = height / viewport.height;
  // A point keeps its exact position; a frame's badge pins to its scaled top-left corner.
  const point = annotation.selection.kind === 'point';
  const left = area.x * scaleX;
  const top = area.y * scaleY;
  return {
    anchor: {
      x: clamp(point ? left : left - badgeRadius, width),
      y: clamp(point ? top : top - badgeRadius, height),
    },
    frame: { x: left, y: top, width: area.width * scaleX, height: area.height * scaleY },
  };
}

function clamp(value: number, edge: number): number {
  if (edge <= badgeRadius * 2) return edge / 2;
  return Math.min(Math.max(value, badgeRadius), edge - badgeRadius);
}

/** Draw one provider capture, its frame, and its index badge.
 * @param annotation - saved annotation carrying the provider capture.
 * @param index - one-based attachment position, the number the request text names.
 * @returns the redrawn JPEG, or the provider capture unchanged when drawing is unavailable.
 */
async function badgeCapture(
  annotation: BrowserAnnotation,
  index: number,
): Promise<BrowserAnnotationImage> {
  const capture = annotation.screenshot;
  if (!capture) throw new Error('annotation-image-unavailable');
  try {
    const picture = new Image();
    picture.src = `data:${capture.mediaType};base64,${capture.data}`;
    await picture.decode();
    if (!picture.naturalWidth || !picture.naturalHeight) throw new Error('annotation-image-failed');
    const scale = Math.min(1, maxEdge / Math.max(picture.naturalWidth, picture.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(picture.naturalWidth * scale);
    canvas.height = Math.round(picture.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('annotation-image-failed');
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const mark = annotationMark(annotation, canvas.width, canvas.height);
    if (!mark) throw new Error('annotation-image-failed');
    const { anchor, frame } = mark;
    if (annotation.selection.kind !== 'point') {
      context.strokeStyle = accent;
      context.lineWidth = 2;
      context.strokeRect(frame.x, frame.y, frame.width, frame.height);
    }
    context.beginPath();
    context.arc(anchor.x, anchor.y, badgeRadius, 0, Math.PI * 2);
    context.fillStyle = accent;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#fff';
    context.stroke();
    context.fillStyle = '#fff';
    context.font = `500 ${badgeRadius + 3}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(index), anchor.x, anchor.y);
    const [, encoded] = canvas.toDataURL('image/jpeg', 0.8).split(',');
    if (!encoded || encoded.length > 4000000) throw new Error('annotation-image-failed');
    return { mediaType: 'image/jpeg', data: encoded, width: canvas.width, height: canvas.height };
  } catch {
    // A provider capture is still usable evidence: keep it when this environment cannot redraw.
    return capture;
  }
}

/** Redraw every attachment capture with its note index.
 * @param annotations - annotations the request sends, in attachment order.
 * @returns one image per annotation, in the same order.
 */
export async function badgeCaptures(
  annotations: readonly BrowserAnnotation[],
): Promise<BrowserAnnotationImage[]> {
  const images: BrowserAnnotationImage[] = [];
  for (const [index, annotation] of annotations.entries())
    images.push(await badgeCapture(annotation, index + 1));
  return images;
}
