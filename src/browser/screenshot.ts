/** Render a provider-captured viewport with its exact saved selection. */
import type { BrowserAnnotation, BrowserAnnotationImage } from './page-inspector';

/** Mark the saved rectangle on actual captured pixels and normalize to a bounded JPEG.
 * @param dataUrl - Browser capture of the inspected viewport, after picker cleanup.
 * @param annotation - saved viewport coordinates.
 * @returns image bytes ready for the official Session image attachment path.
 */
export async function markScreenshot(
  dataUrl: string,
  annotation: BrowserAnnotation,
): Promise<BrowserAnnotationImage> {
  const picture = new Image();
  picture.src = dataUrl;
  await picture.decode();
  if (!picture.naturalWidth || !picture.naturalHeight) throw new Error('annotation-image-failed');
  const scale = Math.min(1, 1600 / Math.max(picture.naturalWidth, picture.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(picture.naturalWidth * scale);
  canvas.height = Math.round(picture.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('annotation-image-failed');
  context.drawImage(picture, 0, 0, canvas.width, canvas.height);
  const sx = canvas.width / annotation.viewport.width;
  const sy = canvas.height / annotation.viewport.height;
  const area = annotation.selection.viewportRect;
  context.strokeStyle = '#1683ff';
  context.fillStyle = '#1683ff';
  context.lineWidth = 2;
  const x = area.x * sx,
    y = area.y * sy;
  if (annotation.selection.kind === 'point') {
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height)
      throw new Error('annotation-image-failed');
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.stroke();
  } else {
    const left = Math.max(1, x),
      top = Math.max(1, y);
    const right = Math.min(canvas.width - 1, x + area.width * sx);
    const bottom = Math.min(canvas.height - 1, y + area.height * sy);
    if (right <= left || bottom <= top) throw new Error('annotation-image-failed');
    context.strokeRect(left, top, right - left, bottom - top);
  }
  const data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]!;
  if (data.length > 4000000) throw new Error('annotation-image-failed');
  return { mediaType: 'image/jpeg', data, width: canvas.width, height: canvas.height };
}
