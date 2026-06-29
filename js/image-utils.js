/* ============================================
   image-utils.js — Image compression for upload
   Resizes and compresses to fit localStorage
   ============================================ */

const ImageUtils = (() => {

  const MAX_DIM = 800;        // max width/height
  const JPEG_QUALITY = 0.65;  // good balance of size vs quality

  /**
   * Compress a File object to a base64 JPEG data URL.
   * @param {File} file — from <input type="file">
   * @returns {Promise<string>} base64 data URL
   */
  async function compressImage(file) {
    // Basic type guard
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('Not an image file');
    }

    // Read file as data URL
    const dataUrl = await readFileAsDataURL(file);

    // Load into an off-screen image
    const img = await loadImage(dataUrl);

    // Calculate target dimensions
    const { width, height } = calcTargetSize(img.naturalWidth, img.naturalHeight, MAX_DIM);

    // Draw onto canvas and export as JPEG
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  }

  // ---- Internal helpers ----

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = src;
    });
  }

  function calcTargetSize(w, h, maxDim) {
    if (w <= maxDim && h <= maxDim) return { width: w, height: h };
    const ratio = Math.min(maxDim / w, maxDim / h);
    return {
      width: Math.round(w * ratio),
      height: Math.round(h * ratio),
    };
  }

  return { compressImage };
})();
