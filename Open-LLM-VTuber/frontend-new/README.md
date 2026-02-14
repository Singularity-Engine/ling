# 灵 Ling — AI 数字人前端

> 与 AI 数字人自然对话的沉浸式前端界面，支持 Live2D 形象驱动、实时语音交互和情感反馈。

<!-- TODO: 添加项目截图 -->
<!-- ![Screenshot](./docs/screenshot.png) -->

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 (SWC) |
| UI | Chakra UI v3 + Framer Motion |
| 数字人 | Live2D WebSDK |
| 通信 | WebSocket（Gateway 协议） |
| 语音 | Web Speech API + VAD（@ricky0123/vad-web） |
| TTS | Fish Audio 前端合成 |
| 状态 | React Context + Zustand |
| 国际化 | i18next（中/英） |

## 核心功能

- **Live2D 数字人** — 全屏 Live2D 角色渲染，支持表情和动作驱动
- **实时对话** — 文字/语音双模态输入，流式文字输出
- **语音合成** — 基于 Fish Audio 的高质量 TTS，角色口型同步
- **语音识别** — Web Speech API + VAD 端点检测，支持打断
- **情感系统** — 好感度引擎驱动角色情绪表现和背景氛围变化
- **工具调用可视化** — Agent 工具执行过程实时展示（水晶浮窗 + 思考光环）
- **沉浸式 UI** — 星空背景、粒子动画、Landing 过场、毛玻璃面板
- **响应式布局** — 桌面端与移动端自适应

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

开发服务器默认运行在 `http://localhost:5173`。

## 项目结构

```
src/
├── components/          # UI 组件
│   ├── canvas/          #   Live2D 画布 & 字幕
│   ├── chat/            #   聊天气泡、输入栏、工具卡片
│   ├── landing/         #   Landing 过场动画 & 粒子效果
│   ├── background/      #   星空背景
│   ├── effects/         #   情绪反馈特效（光环、背景变色）
│   ├── crystal/         #   工具结果水晶浮窗
│   ├── ability/         #   能力环展示
│   ├── status/          #   连接状态 & 好感度指示器
│   └── sidebar/         #   侧边栏
├── services/            # 核心服务
│   ├── gateway-connector.ts       # Gateway WebSocket 连接
│   ├── gateway-message-adapter.ts # Gateway 消息适配
│   ├── tts-service.ts             # TTS 语音合成
│   ├── asr-service.ts             # ASR 语音识别
│   └── websocket-handler.tsx      # WebSocket 消息路由
├── context/             # React Context（状态管理）
├── hooks/               # 自定义 Hooks
├── locales/             # 国际化资源（zh / en）
├── types/               # TypeScript 类型定义
└── utils/               # 工具函数
```

## License

MIT
