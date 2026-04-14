const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

const outputMap = {
  webp: {
    type: 'image/webp',
    extension: 'webp',
    label: 'WebP 图片',
  },
  jpeg: {
    type: 'image/jpeg',
    extension: 'jpg',
    label: 'JPG 图片',
  },
  png: {
    type: 'image/png',
    extension: 'png',
    label: 'PNG 图片',
  },
};

const originalTypeLabelMap = {
  'image/png': 'PNG 原图',
  'image/jpeg': 'JPG 原图',
  'image/webp': 'WebP 原图',
};

let workerSequence = 0;
let pngWorker;
let pngWorkerListenersBound = false;
const pngWorkerTasks = new Map();

export function normalizeImageFiles(fileList) {
  return Array.from(fileList || []).filter((file) => supportedTypes.has(file.type));
}

export function formatBytes(bytes) {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const factor = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** factor;
  return `${value.toFixed(value >= 10 || factor === 0 ? 0 : 1)} ${units[factor]}`;
}

function renameFile(name, extension) {
  const normalized = name.replace(/\.[^.]+$/, '');
  return `${normalized}.${extension}`;
}

function ensurePngWorker() {
  if (!pngWorker) {
    pngWorker = new Worker(new URL('./png-compress-worker.js', import.meta.url), {
      type: 'module',
    });
  }

  if (!pngWorkerListenersBound) {
    pngWorker.addEventListener('message', (event) => {
      const { id, success, arrayBuffer, outputType, width, height, error } = event.data || {};
      const task = pngWorkerTasks.get(id);

      if (!task) {
        return;
      }

      pngWorkerTasks.delete(id);

      if (success) {
        task.resolve({ arrayBuffer, outputType, width, height });
        return;
      }

      task.reject(new Error(error || 'PNG 压缩失败，请稍后重试。'));
    });

    pngWorker.addEventListener('error', (event) => {
      const message = event.message || 'PNG Worker 初始化失败。';

      pngWorkerTasks.forEach(({ reject }) => {
        reject(new Error(message));
      });
      pngWorkerTasks.clear();
    });

    pngWorkerListenersBound = true;
  }

  return pngWorker;
}

async function compressPngInWorker(file, settings) {
  if (typeof Worker === 'undefined') {
    throw new Error('当前浏览器不支持后台线程，无法执行 PNG 专业压缩。');
  }

  const worker = ensurePngWorker();
  const taskId = `png-${Date.now()}-${++workerSequence}`;

  return new Promise((resolve, reject) => {
    pngWorkerTasks.set(taskId, { resolve, reject });
    worker.postMessage({
      id: taskId,
      file,
      settings,
    });
  });
}

async function readImageData(file) {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', {
    alpha: true,
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error('当前浏览器无法创建 Canvas 上下文。');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  bitmap.close?.();

  return { imageData, width, height };
}

export function disposeCompressionResources() {
  if (pngWorker) {
    pngWorker.terminate();
    pngWorker = undefined;
  }

  pngWorkerListenersBound = false;

  pngWorkerTasks.forEach(({ reject }) => {
    reject(new Error('压缩任务已取消。'));
  });
  pngWorkerTasks.clear();
}

async function encodeRasterImage(imageData, format) {
  if (format === 'jpeg') {
    const jpeg = await import('@jsquash/jpeg');
    const encodedBuffer = await jpeg.encode(imageData, { quality: 82 });
    return new Blob([encodedBuffer], { type: 'image/jpeg' });
  }

  const webp = await import('@jsquash/webp');
  const encodedBuffer = await webp.encode(imageData, { quality: 82 });
  return new Blob([encodedBuffer], { type: 'image/webp' });
}

function resolveOutputLabel(format) {
  return (outputMap[format] || outputMap.webp).label;
}

// lossless PNG 在主线程处理：主线程 isWorker=false，@jsquash/oxipng 强制走 ST
// （Worker 里多线程检测导致 WASM 路径无法解析，解析失败后调用 optimise 就会 unwrap_throw）
async function compressPngLosslessOnMainThread(file) {
  const { optimise } = await import('@jsquash/oxipng');

  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;

  const rawBuffer = await file.arrayBuffer();

  // 用魔术字节判断实际内容是否为 PNG（扩展名可能被改过）
  const magic = new Uint8Array(rawBuffer, 0, 4);
  const isRealPng = magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e && magic[3] === 0x47;

  let pngBuffer;
  let resultMimeType = 'image/png';

  if (isRealPng) {
    bitmap.close?.();
    pngBuffer = rawBuffer;

    const optimizedBuffer = await optimise(pngBuffer, {
      level: 4,
      interlace: false,
      optimiseAlpha: true,
    });
    return { arrayBuffer: optimizedBuffer, outputType: 'PNG 无损优化', mimeType: resultMimeType, width, height };
  }

  // 内容不是真正的 PNG（如扩展名伪装的 JPEG）——直接按 JPEG 进行有损压缩（体积更小），直接返回压缩后的 JPEG 数据，后缀仍然保持 .png
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const imageData = ctx.getImageData(0, 0, width, height);
  const jpeg = await import('@jsquash/jpeg');

  const jpegBuffer = await jpeg.encode(imageData, { quality: 82 });

  return {
    arrayBuffer: jpegBuffer,
    outputType: 'JPEG 照片压缩',
    mimeType: 'image/png', // 强制设为 image/png，这样下载时配合 .png 扩展名不会被浏览器纠正，但实际内容是 JPEG
    width,
    height,
  };
}

export async function compressImage(file, settings) {
  const format = settings.format || 'webp';
  const output = outputMap[format] || outputMap.webp;

  let encodedBlob;
  let outputType;
  let width;
  let height;

  if (format === 'png') {
    const pngMode = settings.pngMode || 'lossless';
    let pngResult;

    if (pngMode === 'lossless' && file.type === 'image/png') {
      // PNG 输入的无损压缩在主线程执行，避免 Worker 内 WASM 初始化失败
      pngResult = await compressPngLosslessOnMainThread(file);
    } else {
      pngResult = await compressPngInWorker(file, settings);
    }

    encodedBlob = new Blob([pngResult.arrayBuffer], { type: pngResult.mimeType || 'image/png' });
    outputType = pngResult.outputType;
    width = pngResult.width;
    height = pngResult.height;
  } else {
    const imageSource = await readImageData(file);
    encodedBlob = await encodeRasterImage(imageSource.imageData, format);
    outputType = resolveOutputLabel(format);
    width = imageSource.width;
    height = imageSource.height;
  }

  let finalBlob = encodedBlob;
  let outputName = renameFile(file.name, output.extension);
  let retainedOriginal = false;

  if (encodedBlob.size >= file.size) {
    finalBlob = file;
    outputName = file.name;
    outputType = `${originalTypeLabelMap[file.type] || '原图'} · 已保留`;
    retainedOriginal = true;
  }

  const savingRate = Math.max(Math.round(((file.size - finalBlob.size) / file.size) * 100), 0);
  const downloadUrl = URL.createObjectURL(finalBlob);

  return {
    blob: finalBlob,
    downloadUrl,
    outputName,
    outputType,
    savingRate,
    retainedOriginal,
    width,
    height,
  };
}
