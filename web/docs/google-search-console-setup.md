# Google Search Console 配置指南 — sngxai.com

> 多语言 SPA (8 语言) 的 SEO 完整配置清单

---

## 1. 验证网站所有权

### 推荐方式：DNS TXT 记录

1. 打开 [Google Search Console](https://search.google.com/search-console)
2. 点击 **添加资源** → 选择 **网域** → 输入 `sngxai.com`
3. Google 会给你一条 TXT 记录，格式如：
   ```
   google-site-verification=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. 到域名 DNS 管理面板（Cloudflare / Namecheap 等），添加 TXT 记录
5. 回到 Search Console 点击 **验证**

### 备选方式：HTML meta 标签

如果 DNS 验证不方便，可以在 `index.html` 的 `<head>` 中添加：
```html
<meta name="google-site-verification" content="你的验证码" />
```

> 我们的 prerender 方案已为 `/terms`, `/login`, `/register` 生成独立 HTML，但它们共用 `index.html` 模板，所以只需在主 `index.html` 加一次即可。

---

## 2. 提交 Sitemap

1. 在 Search Console 左侧导航 → **Sitemap**
2. 输入 `https://ling.sngxai.com/sitemap.xml` → 点击 **提交**
3. 等待 Google 抓取完成（通常 1-3 天）

### 当前 sitemap 结构

```
sitemap.xml
├── https://ling.sngxai.com/          (priority: 1.0, 8 hreflang)
└── https://ling.sngxai.com/terms     (priority: 0.5, 8 hreflang)
```

每个 `<url>` 包含 8 个 `xhtml:link rel="alternate"` hreflang 标签 + `x-default`。

---

## 3. 国际定位 (International Targeting)

### 3.1 hreflang 验证

Google Search Console → **旧版工具和报告** → **国际定位** → **语言** 标签页。

检查是否正确识别了我们的 8 个 hreflang 标签：

| hreflang | 目标 | URL |
|----------|------|-----|
| `en` | 英语 | `https://ling.sngxai.com/` |
| `zh` | 中文 | `https://ling.sngxai.com/` |
| `ja` | 日语 | `https://ling.sngxai.com/` |
| `ko` | 韩语 | `https://ling.sngxai.com/` |
| `es` | 西班牙语 | `https://ling.sngxai.com/` |
| `pt-BR` | 巴西葡语 | `https://ling.sngxai.com/` |
| `de` | 德语 | `https://ling.sngxai.com/` |
| `fr` | 法语 | `https://ling.sngxai.com/` |
| `x-default` | 默认 | `https://ling.sngxai.com/` |

> **注意**：因为我们是 SPA（单一 URL，客户端路由切换语言），所有 hreflang 指向同一 URL。Google 会通过页面内容和 `<html lang="...">` 属性判断实际语言。这是 SPA 多语言的标准做法。

### 3.2 国家/地区定位

- **不要**设置特定国家定位 — 我们的目标是全球用户
- 保持 "未列出" 状态即可

---

## 4. URL 检查与索引请求

部署后，手动请求 Google 抓取关键页面：

1. Search Console → **URL 检查**
2. 依次输入并请求编入索引：
   - `https://ling.sngxai.com/`
   - `https://ling.sngxai.com/terms`
   - `https://ling.sngxai.com/login`
   - `https://ling.sngxai.com/register`
3. 每个 URL 点击 **请求编入索引**

### 验证 Google 看到的内容

在 URL 检查工具中，点击 **查看抓取的网页**，确认：
- [x] `<title>` 标签正确（各页面不同）
- [x] `<meta name="description">` 正确
- [x] `og:title`, `og:description`, `og:image` 正确
- [x] hreflang 链接可见
- [x] JSON-LD 结构化数据可见
- [x] 页面主体内容已渲染（SPA 需要 JS 渲染，Google 会执行 JS）

---

## 5. 结构化数据验证

### 5.1 Rich Results Test

用 Google 的 [Rich Results Test](https://search.google.com/test/rich-results) 测试：
- `https://ling.sngxai.com/`

确认 JSON-LD 被正确解析：
- `@type: WebApplication` — 应用名称、描述、免费价格
- `@type: Organization` — Singularity Engine 品牌信息

### 5.2 Schema Markup Validator

用 [Schema.org Validator](https://validator.schema.org/) 做更详细的校验。

---

## 6. Core Web Vitals 监控

Search Console → **体验** → **Core Web Vitals**

关注三个指标：
| 指标 | 目标 | 我们的优化 |
|------|------|-----------|
| **LCP** (最大内容绘制) | < 2.5s | 预加载 favicon.svg, Live2D core; preconnect API |
| **INP** (交互延迟) | < 200ms | React 18 并发模式 |
| **CLS** (累积布局偏移) | < 0.1 | 固定 viewport, loading fallback 防闪烁 |

### 已实施的性能优化

- `<link rel="preload">` — Live2D core, favicon
- `<link rel="preconnect">` — API 和 TTS 端点
- `<link rel="dns-prefetch">` — 提前 DNS 解析
- `<link rel="modulepreload">` — vendor chunks 预加载
- Loading fallback — 防止白屏和 CLS
- 语言 chunk 懒加载 — 减小首屏 bundle

---

## 7. 移动端可用性

Search Console → **体验** → **移动设备易用性**

我们已配置：
- `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />`
- 响应式布局（CSS Grid + Flexbox）
- `100dvh` 动态视口高度

如果出现问题，常见修复：
- 字体过小 → 检查 `font-size` 是否 >= 16px
- 可点击元素太近 → 确保 touch target >= 48px
- 内容超出屏幕 → 检查 `overflow-x: hidden`

---

## 8. 安全问题

Search Console → **安全与手动操作** → **安全问题**

保持关注，确保：
- 没有恶意软件警告
- 没有社交工程警告
- HTTPS 正常工作（我们有 `index.html` 中的自动重定向脚本）

---

## 9. 外部 SEO 工具推荐

| 工具 | 用途 | 地址 |
|------|------|------|
| **Google PageSpeed Insights** | 性能分析 | pagespeed.web.dev |
| **Lighthouse** (Chrome DevTools) | 综合审计 | Chrome → F12 → Lighthouse |
| **Ahrefs / SEMrush** | 关键词排名跟踪 | ahrefs.com / semrush.com |
| **Screaming Frog** | 爬虫模拟 | screamingfrog.co.uk |

---

## 10. 部署后 Checklist

部署到生产环境后，按顺序执行：

- [ ] 确认 `https://ling.sngxai.com/robots.txt` 可访问
- [ ] 确认 `https://ling.sngxai.com/sitemap.xml` 可访问且格式正确
- [ ] 在 Search Console 提交 sitemap
- [ ] 对 4 个主要 URL 请求编入索引
- [ ] 用 Rich Results Test 验证结构化数据
- [ ] 用 URL 检查工具确认 Google 能渲染页面内容
- [ ] 检查 hreflang 是否被正确识别（国际定位报告）
- [ ] 运行 Lighthouse 审计，确认 SEO 评分 >= 90
- [ ] 检查移动端可用性报告无错误
- [ ] 一周后回来检查索引覆盖率报告

---

## 11. 持续维护

| 频率 | 任务 |
|------|------|
| 每周 | 查看 Search Console 首页概览，关注异常 |
| 每月 | 检查索引覆盖率、Core Web Vitals 趋势 |
| 每次部署 | 运行 `npm run build` 自动更新 sitemap |
| 新增页面时 | 在 `scripts/generate-sitemap.mjs` 和 `scripts/prerender-routes.mjs` 中添加新路由 |
| 新增语言时 | 更新 `SUPPORTED_LANGUAGES`，其他系统自动适配 |

---

## 技术架构参考

```
请求流程 (SEO 视角):

Googlebot 请求 sngxai.com/terms
    │
    ├─→ Cloudflare CDN 返回 dist/terms/index.html (预渲染)
    │     ├─ <title>Terms of Service — Ling</title>
    │     ├─ <meta name="description" content="...">
    │     ├─ <link rel="alternate" hreflang="en" href="..."> × 8
    │     ├─ <script type="application/ld+json">...</script>
    │     └─ <div id="root"></div>  ← Googlebot 执行 JS 渲染完整内容
    │
    ├─→ robots.txt → Allow: /terms
    │
    └─→ sitemap.xml → <url><loc>https://ling.sngxai.com/terms</loc> + hreflang</url>
```

```
语言切换流程:

用户点击语言切换器
    │
    ├─→ ensureLanguageLoaded('ja') — 懒加载 locale-ja chunk
    ├─→ i18n.changeLanguage('ja')
    ├─→ document.documentElement.lang = 'ja'
    ├─→ localStorage.setItem('i18nextLng', 'ja')
    └─→ React Helmet 动态更新:
          ├─ <title>リン — 初のAI起業家と話そう</title>
          ├─ <meta property="og:locale" content="ja_JP">
          └─ hreflang 标签保持不变 (静态)
```
