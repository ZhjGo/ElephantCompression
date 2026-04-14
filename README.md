# 🐘 小象压图 (Little Elephant Compress)

> **极致轻盈，肉眼无损。** 一个完全基于浏览器本地计算的高性能图片压缩工具。

小象压图是一款隐私友好、无需上传服务器的在线图片压缩工具。基于 `Next.js` 与 `WebAssembly (WASM)` 技术，在保障用户隐私的同时，提供媲美原生应用的压缩效率与画质。

## ✨ 功能亮点

- **🔒 隐私至上**：所有压缩逻辑均在本地浏览器内完成。图片不会离开你的设备，百分百保障数据安全。
- **⚡️ 极速体验**：利用 WebWorker 与 WASM (Rust/C++) 处理繁重的图像算法，无等待上传下载，即拖即压。
- **🐘 极致压缩**：
  - **PNG 专业优化**：支持基于 `oxipng` 的无损优化，以及基于 `imagequant` 的专业级量化压缩。
  - **智能识别**：自动识别“伪装成 PNG”的 JPEG 文件，并执行针对性压缩策略。
  - **主流格式支持**：完美支持 WebP、JPG、PNG 相互转换与优化。
- **💎 现代设计**：采用极简玻璃拟态设计，提供如同系统原生应用般的丝滑操作体验。

## 🚀 快速开始

可以通过以下命令在本地启动开发环境：

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev
```

打开浏览器访问 `http://localhost:3000` 即可开始使用。

## 🛠️ 技术栈

- **框架**: [Next.js (App Router)](https://nextjs.org/)
- **逻辑层**: [WebAssembly (WASM)](https://webassembly.org/)
- **压缩引擎**: 
  - [oxipng](https://github.com/shimataro/oxipng) (WASM)
  - [MozJPEG](https://github.com/mozilla/mozjpeg) (WASM)
  - [WebP](https://developers.google.com/speed/webp) (WASM)
- **UI 风格**: Vanilla CSS (Modern CSS Properties)

## 📦 构建与部署

本项目支持全静态导出，非常适合部署在 Cloudflare Pages, Vercel 或 Nginx。

```bash
# 构建生产包
npm run build
```

构建完成后，静态文件将输出至 `out` 目录。

## 📄 开源协议

本项目采用 MIT 协议。
