'use client';

import JSZip from 'jszip';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  compressImage,
  disposeCompressionResources,
  formatBytes,
  normalizeImageFiles,
} from '../lib/compress-image';

const initialSettings = {
  format: 'webp',
  pngMode: 'lossless',
};

const featureItems = [
  {
    title: '批量压缩',
    description: '支持一次选择多张图片，处理完成后一键打包下载 ZIP。',
  },
  {
    title: '格式可选',
    description: '可输出为 WebP、JPG 或 PNG，按你的使用场景选择。',
  },
  {
    title: '隐私更安心',
    description: '图片仅在你的浏览器中处理，不经过第三方服务器。',
  },
];

const steps = [
  '拖拽或选择图片',
  '选择导出格式',
  '压缩完成后立即下载',
];

function createQueueItem(file) {
  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    originalSize: file.size,
    previewUrl: URL.createObjectURL(file),
    downloadUrl: '',
    outputName: '',
    outputType: '',
    compressedSize: 0,
    savingRate: 0,
    width: 0,
    height: 0,
    progress: 0,
    status: '等待中',
    error: '',
    retainedOriginal: false,
  };
}

export default function CompressorApp() {
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(initialSettings);
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState(null);
  const inputRef = useRef(null);
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const settingsRef = useRef(settings);
  const urlsRef = useRef(new Set());

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      disposeCompressionResources();
    };
  }, []);

  const getSummary = (itemsToSummarize) => {
    const finished = itemsToSummarize.filter((item) => item.compressedSize > 0 && !item.error);
    const pending = itemsToSummarize.filter((item) => item.compressedSize === 0 && !item.error);
    const originalTotal = finished.reduce((sum, item) => sum + item.originalSize, 0);
    const compressedTotal = finished.reduce((sum, item) => sum + item.compressedSize, 0);
    const saved = Math.max(originalTotal - compressedTotal, 0);

    return {
      finishedCount: finished.length,
      pendingCount: pending.length,
      saved,
      savedRate: originalTotal > 0 ? Math.round((saved / originalTotal) * 100) : 0,
    };
  };

  const globalSummary = useMemo(() => getSummary(items), [items]);

  const currentBatchSummary = useMemo(() => {
    if (!currentBatchId) return getSummary([]);
    return getSummary(items.filter((item) => item.batchId === currentBatchId));
  }, [items, currentBatchId]);

  const updateItem = (id, patch) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const runQueue = async () => {
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const task = queueRef.current.shift();
      const { id, file, taskSettings } = task;
      let progressValue = 5;

      updateItem(id, { status: '准备压缩...', progress: progressValue });

      const timer = window.setInterval(() => {
        progressValue = Math.min(progressValue + Math.random() * 12, 92);
        updateItem(id, { progress: Math.round(progressValue), status: '压缩中...' });
      }, 180);

      try {
        const result = await compressImage(file, taskSettings);
        window.clearInterval(timer);

        if (result.downloadUrl) {
          urlsRef.current.add(result.downloadUrl);
        }

        updateItem(id, {
          status: result.retainedOriginal ? '已保留原图' : '压缩完成',
          progress: 100,
          compressedSize: result.blob.size,
          savingRate: result.savingRate,
          downloadUrl: result.downloadUrl,
          outputName: result.outputName,
          outputType: result.outputType,
          width: result.width,
          height: result.height,
          retainedOriginal: result.retainedOriginal,
        });
      } catch (error) {
        window.clearInterval(timer);
        updateItem(id, {
          status: '处理失败',
          progress: 0,
          error: error instanceof Error ? error.message : '压缩失败，请重试。',
        });
      }
    }

    processingRef.current = false;
  };

  const enqueueFiles = async (fileList) => {
    const validFiles = normalizeImageFiles(fileList);
    if (validFiles.length === 0) {
      return;
    }

    const batchId = Date.now().toString();
    setCurrentBatchId(batchId);

    const newItems = validFiles.map((file) => ({
      ...createQueueItem(file),
      batchId,
    }));

    newItems.forEach((item) => {
      urlsRef.current.add(item.previewUrl);
      queueRef.current.push({
        id: item.id,
        file: item.file,
        taskSettings: settingsRef.current,
      });
    });

    setItems((current) => [...newItems.reverse(), ...current]);
    await runQueue();
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setIsDragging(false);
    await enqueueFiles(event.dataTransfer.files);
  };

  const onInputChange = async (event) => {
    await enqueueFiles(event.target.files);
    event.target.value = '';
  };

  const handleDownloadSequential = async () => {
    const downloadableItems = items.filter(
      (item) => item.batchId === currentBatchId && item.downloadUrl && !item.error
    );
    if (downloadableItems.length === 0) return;

    if (downloadableItems.length === 1) {
      // 当前次只有一张，直接原生下载
      const item = downloadableItems[0];
      const link = document.createElement('a');
      link.href = item.downloadUrl;
      link.download = item.outputName || item.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      // 当前次有多张，自动打个 ZIP
      setIsDownloadingAll(true);
      try {
        const zip = new JSZip();
        await Promise.all(
          downloadableItems.map(async (item) => {
            const response = await fetch(item.downloadUrl);
            const blob = await response.blob();
            zip.file(item.outputName || item.name, blob);
          }),
        );
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `compressed_batch_${downloadableItems.length}_images.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error(error);
        window.alert('打包下载失败，请稍后再试。');
      } finally {
        setIsDownloadingAll(false);
      }
    }
  };

  const handleDownloadZip = async () => {
    const downloadableItems = items.filter((item) => item.downloadUrl && !item.error);

    if (downloadableItems.length === 0 || isDownloadingAll) {
      return;
    }

    setIsDownloadingAll(true);

    try {
      const zip = new JSZip();

      // 并行 fetch 所有图片 blob 并加入 zip
      await Promise.all(
        downloadableItems.map(async (item) => {
          const response = await fetch(item.downloadUrl);
          const blob = await response.blob();
          zip.file(item.outputName || item.name, blob);
        }),
      );

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `compressed_${downloadableItems.length}_images.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      window.alert('打包下载失败，请稍后再试。');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="page-glow page-glow-primary" />
      <div className="page-glow page-glow-secondary" />

      <header className="site-header">
        <div className="site-header__inner">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" width="32" height="32" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px' }}>
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              <rect width="24" height="24" rx="6" fill="url(#logoGrad)" />
              {/* 小象的简约现代几何图形 */}
              <path d="M19,13.5 A1.5,1.5 0 0,0 20.5,12 C20.5,8 16.5,6 12,6 C7.5,6 4.5,9 4.5,13.5 C4.5,14 4.8,14.5 5.2,14.5 L7.5,14.5 L7.5,18 A1.2,1.2 0 0,0 9.9,18 L9.9,14.5 L11.5,14.5 L11.5,18 A1.2,1.2 0 0,0 13.9,18 L13.9,12.5 C13.9,11.5 14.5,10.5 15.5,10.5 C16.5,10.5 17,11.5 17,12.5 L17,17 A2,2 0 0,0 19,19 C20.5,19 21,18 21,16 A1,1 0 0,0 19.5,17 C19,17 18.5,16.5 18.5,16 L18.5,12.5 L19,13.5 Z" fill="#ffffff" />
              {/* 大象眼睛部位的镂空感 */}
              <circle cx="10" cy="10" r="1.2" fill="url(#logoGrad)" />
            </svg>
            <span className="brand-mark__text">小象压图</span>
          </div>

          <nav className="site-nav">
            <a href="#compressor">开始压缩</a>
            <a href="#features">功能亮点</a>
          </nav>
        </div>
      </header>

      <section className="hero-section">
        <h1>
          小巧纯粹，
          <br />
          <span>无损压缩。</span>
        </h1>
        <div className="hero-points">
          {steps.map((step, index) => (
            <div key={step} className="hero-point">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-grid" id="compressor">
        <div className="glass-panel uploader-panel">
          <div
            className={`dropzone ${isDragging ? 'dropzone--active' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) {
                setIsDragging(false);
              }
            }}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={onInputChange}
            />

            <div className="dropzone__icon">📤</div>
            <h2>将图片拖拽至此</h2>
            <p>支持 PNG / JPG / WebP，拖进来就能开始压缩。</p>

            <div className="dropzone__actions">
              <button className="button button--primary" type="button">
                选择图片
              </button>
              <span>单次可连续加入多张图片</span>
            </div>
          </div>
        </div>

        <aside className="glass-panel controls-panel">
          <div className="panel-title-row">
            <div>
              <h3>压缩设置</h3>
            </div>
          </div>

          <label className="field-block">
            <span>导出格式</span>
            <select
              value={settings.format}
              onChange={(event) =>
                setSettings((current) => ({ ...current, format: event.target.value }))
              }
            >
              <option value="webp">WebP · 更省空间</option>
              <option value="jpeg">JPG · 兼容更广</option>
              <option value="png">PNG · 专业压缩</option>
            </select>
          </label>

          {settings.format === 'png' ? (
            <label className="field-block">
              <span>PNG 模式</span>
              <select
                value={settings.pngMode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    pngMode: event.target.value,
                  }))
                }
              >
                <option value="lossless">无损优化 · 颜色不变</option>
                <option value="balanced">平衡压缩 · 专业量化</option>
                <option value="aggressive">高压压缩 · 体积优先</option>
              </select>
            </label>
          ) : null}

          <div className="summary-card">
            <p>
              本次处理 {currentBatchSummary.finishedCount} 张图片
              {currentBatchSummary.pendingCount > 0 && (
                <span className="summary-card__pending">· {currentBatchSummary.pendingCount} 张处理中</span>
              )}
            </p>
            <strong>{formatBytes(currentBatchSummary.saved)}</strong>
            <span>目前已节省 {currentBatchSummary.savedRate}% 的空间</span>
            <div className="summary-card__actions">
              <button
                className={`button button--secondary ${
                  currentBatchSummary.finishedCount === 0 || currentBatchSummary.pendingCount > 0 || isDownloadingAll
                    ? 'button--disabled'
                    : ''
                }`}
                type="button"
                onClick={handleDownloadSequential}
                disabled={currentBatchSummary.finishedCount === 0 || currentBatchSummary.pendingCount > 0 || isDownloadingAll}
              >
                {isDownloadingAll
                  ? '正在打包...'
                  : currentBatchSummary.pendingCount > 0
                    ? `${currentBatchSummary.pendingCount} 张处理中...`
                    : currentBatchSummary.finishedCount > 0
                      ? (currentBatchSummary.finishedCount === 1 ? '直接下载 (1 张)' : `打包当前次 ${currentBatchSummary.finishedCount} 张`)
                      : '等待图片完成'}
              </button>
              <span className="summary-card__hint">PNG 支持无损优化和专业量化两条链路；照片仍更推荐 WebP 或 JPG。</span>
            </div>
          </div>

        </aside>
      </section>

      <section className="results-section">
        <div className="section-heading">
          <div>
            <p className="panel-eyebrow">压缩结果</p>
            <h3>图片列表</h3>
          </div>
          <button
            className={`button button--secondary ${
              globalSummary.finishedCount === 0 || globalSummary.pendingCount > 0 || isDownloadingAll
                ? 'button--disabled'
                : ''
            }`}
            type="button"
            onClick={handleDownloadZip}
            disabled={globalSummary.finishedCount === 0 || globalSummary.pendingCount > 0 || isDownloadingAll}
          >
            {isDownloadingAll
              ? '正在打包 ZIP...'
              : globalSummary.pendingCount > 0
                ? `${globalSummary.pendingCount} 张处理中...`
                : globalSummary.finishedCount > 0
                  ? `打包历史全部 (${globalSummary.finishedCount} 张)`
                  : '等待打包'}
          </button>
        </div>

        <div className="results-list">
          {items.length === 0 ? (
            <div className="glass-panel empty-state">
              <strong>还没有图片</strong>
              <span>上传图片后，这里会显示处理进度、压缩效果和下载入口。</span>
            </div>
          ) : (
            items.map((item) => (
              <article className="glass-panel result-item" key={item.id}>
                <div className="result-item__preview">
                  <img src={item.previewUrl} alt={item.name} />
                </div>

                <div className="result-item__body">
                  <div className="result-item__top">
                    <div className="result-item__name-wrap">
                      <strong>{item.name}</strong>
                      <span>
                        {item.width > 0 && item.height > 0
                          ? `${item.width} × ${item.height}`
                          : '读取图片信息中'}
                      </span>
                    </div>

                    <span className={`status-badge ${item.error ? 'status-badge--error' : ''}`}>
                      {item.error || item.status}
                    </span>
                  </div>

                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${item.progress}%` }} />
                  </div>

                  <div className="result-item__meta">
                    <span>{formatBytes(item.originalSize)}</span>
                    <span>{item.compressedSize ? formatBytes(item.compressedSize) : '等待完成'}</span>
                    <span>
                      {item.compressedSize
                        ? item.retainedOriginal
                          ? '原图更小'
                          : `-${item.savingRate}%`
                        : '正在处理'}
                    </span>
                  </div>

                  <div className="result-item__actions">
                    <span>{item.outputType || '正在生成可下载图片'}</span>
                    {item.downloadUrl ? (
                      <a className="button button--secondary" href={item.downloadUrl} download={item.outputName}>
                        下载图片
                      </a>
                    ) : (
                      <button className="button button--secondary button--disabled" type="button" disabled>
                        等待完成
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="features-section" id="features">
        {featureItems.map((feature) => (
          <div className="glass-panel feature-card" key={feature.title}>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        ))}
      </section>

      <footer className="site-footer">
        <span>小象压图</span>
        <span>你的专属前端纯粹图片瘦身工具</span>
      </footer>
    </main>
  );
}
