const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 1600;

export async function normalizeImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > MAX_INPUT_BYTES) throw new Error('单张原图不能超过 20MB');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法处理这张图片');
    context.drawImage(bitmap, 0, 0, width, height);
    let output = await canvasToBlob(canvas, 'image/webp', 0.82);
    if (!output || output.type !== 'image/webp') output = await canvasToBlob(canvas, 'image/jpeg', 0.82);
    if (!output) throw new Error('图片编码失败');
    if (output.size > MAX_OUTPUT_BYTES) {
      output = await canvasToBlob(canvas, 'image/jpeg', 0.68);
      if (!output || output.size > MAX_OUTPUT_BYTES) throw new Error('处理后的图片仍超过 5MB');
    }
    return output;
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
