const pngModeProfiles = {
  lossless: {
    label: 'PNG 无损优化',
    oxipngLevel: 4,
  },
  balanced: {
    label: 'PNG 平衡压缩',
    oxipngLevel: 4,
    quantization: {
      maxColors: 256,
      speed: 2,
      quality: {
        min: 80,
        target: 92,
      },
      dithering: 0.9,
      posterization: 0,
    },
  },
  aggressive: {
    label: 'PNG 高压压缩',
    oxipngLevel: 6,
    quantization: {
      maxColors: 192,
      speed: 3,
      quality: {
        min: 55,
        target: 82,
      },
      dithering: 0.72,
      posterization: 0,
    },
  },
};

// 分开缓存，oxipng 和 imagequant 互不干扰
let oxipngPromise;
let imagequantPromise;

function arrayBufferFromView(view) {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

// 直接用 ST（单线程）codec，绕过 optimise.js 里依赖
// navigator.hardwareConcurrency + SharedArrayBuffer 的多线程检测路径
// （在 Worker 环境下 MT 路径会调用 initThreadPool，
//  未配置 COOP/COEP 的场景下 Rust unwrap 会崩溃）
async function loadOxipng() {
  if (!oxipngPromise) {
    oxipngPromise = (async () => {
      const { default: init, optimise } = await import(
        '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js'
      );
      await init();
      return optimise;
    })();
  }
  return oxipngPromise;
}

async function loadImagequant() {
  if (!imagequantPromise) {
    imagequantPromise = Promise.all([
      import('@fe-daily/libimagequant-wasm'),
      import('@fe-daily/libimagequant-wasm/wasm/libimagequant_wasm.js'),
    ]).then(
      ([libImageQuantModule, wasmModule]) =>
        new libImageQuantModule.default({ wasmModule }),
    );
  }
  return imagequantPromise;
}

async function readImageData(file) {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('当前浏览器不支持 OffscreenCanvas，暂时无法在后台线程压缩 PNG。');
  }

  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', {
    alpha: true,
    willReadFrequently: true,
  });

  if (!context) {
    bitmap.close?.();
    throw new Error('当前浏览器无法在后台线程创建 Canvas 上下文。');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  bitmap.close?.();

  return { imageData, width, height, canvas };
}

async function canvasToPngBlob(canvas) {
  if (typeof canvas.convertToBlob !== 'function') {
    throw new Error('当前浏览器不支持 OffscreenCanvas 导出 PNG。');
  }

  return canvas.convertToBlob({ type: 'image/png' });
}

async function optimisePngArrayBuffer(arrayBuffer, level) {
  const optimise = await loadOxipng();
  // ST codec raw signature: optimise(data: Uint8Array, level, interlace, optimiseAlpha) -> Uint8Array
  const result = optimise(new Uint8Array(arrayBuffer), level, false, true);
  return arrayBufferFromView(result);
}

async function encodePng(file, settings) {
  const mode = settings.pngMode || 'lossless';
  const profile = pngModeProfiles[mode] || pngModeProfiles.lossless;

  if (mode === 'lossless') {
    if (file.type === 'image/png') {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close?.();

      const arrayBuffer = await optimisePngArrayBuffer(await file.arrayBuffer(), profile.oxipngLevel);
      return { arrayBuffer, outputType: profile.label, width, height };
    }

    const { canvas, width, height } = await readImageData(file);
    const pngBlob = await canvasToPngBlob(canvas);
    const arrayBuffer = await optimisePngArrayBuffer(await pngBlob.arrayBuffer(), profile.oxipngLevel);
    return { arrayBuffer, outputType: profile.label, width, height };
  }

  const quantizer = await loadImagequant();
  const { imageData, width, height } = await readImageData(file);
  const result = await quantizer.quantizeImageData(imageData, profile.quantization);
  const optimizedBuffer = await optimisePngArrayBuffer(
    arrayBufferFromView(result.pngBytes),
    profile.oxipngLevel,
  );

  return {
    arrayBuffer: optimizedBuffer,
    outputType: `${profile.label} · ${result.paletteLength} 色`,
    width,
    height,
  };
}

self.onmessage = async (event) => {
  const { id, file, settings } = event.data || {};

  if (!id || !file) {
    return;
  }

  try {
    const result = await encodePng(file, settings || {});
    self.postMessage(
      {
        id,
        success: true,
        arrayBuffer: result.arrayBuffer,
        outputType: result.outputType,
        width: result.width,
        height: result.height,
      },
      [result.arrayBuffer],
    );
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : 'PNG 压缩失败，请稍后重试。',
    });
  }
};
