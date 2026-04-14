# 小象压图

基于 `Next.js App Router` + `WASM` 的在线图片压缩站点。

## 目标

- 复刻当前 `index.html` 的高级玻璃态风格
- 去掉 API 接入与价格模块
- 只保留“在线图片压缩”核心能力
- 压缩逻辑在浏览器端完成，不上传原图
- 适合直接部署到 Cloudflare Pages

## 技术选型

- `Next.js`：页面组织与静态导出
- `@jsquash/jpeg`：MozJPEG WASM 编码
- `@jsquash/webp`：WebP WASM 编码
- `output: 'export'`：生成纯静态站点，部署简单

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建完成后输出目录为 `out`。

## Cloudflare Pages 部署

根据 Cloudflare Pages 的静态 Next.js 指南，这个项目可以按静态导出站点部署：

- Framework preset: `Next.js (Static HTML Export)`
- Build command: `npm run build`
- Build output directory: `out`

如果你后续需要接入上传、鉴权、任务队列或图片存储，再切到 Cloudflare Workers + OpenNext 会更合适；当前这个站点不需要。
