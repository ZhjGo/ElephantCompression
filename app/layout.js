import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: '小象压图 - 免费极速的本地在线图片压缩工具',
  description: '小象压图是一款完全基于浏览器前端计算的纯本地图片压缩工具。支持 WebP、JPG 以及 PNG 无损优化。全部图片压缩在本地极速完成，数据不上传服务器，体积瞬间变小且不失真，百分百保障隐私安全。',
  keywords: '图片压缩, 在线压图, 图片瘦身, 小象压图, PNG无损压缩, WebP转换, 前端压缩图像',
  authors: [{ name: '小象压图' }],
  robots: 'index, follow',
  openGraph: {
    title: '小象压图 - 纯原生的极速图片极致瘦身站',
    description: '无需上传即刻压缩，支持极致PNG无损算法，在1秒内将照片减负。不涉及服务器，百分百保护本地相册隐私。',
    url: 'https://xiaoxiang.com', // 假设的站名
    siteName: '小象压图',
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '小象压图 - 本地化极速图片压缩神器',
    description: '无需等待文件上传，纯前端性能释放，极致无损保留画样并缩减体积！',
  },
  icons: {
    icon: '/favicon.svg',
  },
  verification: {
    google: '1vnbOJN2KsxyFibnZN5bycjOjkaaDYOk8C1t5AVUuUU',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-2GR4Z26ZLN"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-2GR4Z26ZLN');
          `}
        </Script>
      </body>
    </html>
  );
}
