# DeDream Machine 架构与技术演进文档

本文档总结了「拆梦机器」当前的技术架构、踩过的坑、以及关键设计决策。方便后续开发和阅读。

## 1. 核心目标
本项目的目标是打造一个流畅、现代化的「影片拆解与分析工作站」。
它**不是一个视频剪辑软件（NLE）**，而是一个专注于「看、标记、切分、记录」的工具，因此核心诉求是：
- **操作流畅**：随意拖拽时间轴、逐帧查看时不能有丝毫卡顿。
- **界面现代化**：类似现代化 Web 产品的体验，摆脱传统桌面软件的笨重感。

## 2. 当前技术架构 (Web + Rust Tauri)
为了兼顾跨平台能力与原生性能，我们采用了 **Tauri (Rust) + React (TypeScript) + Vite** 的混合架构。
*   **前端 (React)**：负责所有 UI 渲染、状态管理 (Zustand) 和时间轴交互。时间轴使用了 Canvas 绘制以保证长视频大面积重绘时的性能。
*   **后端 (Rust)**：负责系统级能力的调用（如文件系统、执行 FFmpeg）、以及**本地视频流服务**。
*   **引擎限制 (WebKit)**：Tauri 在 macOS 上使用的是系统自带的 WKWebView。这是一个非常严苛无情的浏览器内核，几乎只能硬解极其标准的 H.264 + AAC 格式。

---

## 3. 核心大坑与 "Proxy-First" 设计

### 踩过的坑：黑屏与 Error 4
早期我们试图让 WebKit 直接加载用户导入的视频（为了达到“秒开”）。但这导致了严重的兼容性灾难：
1. `asset://` 协议：出于安全原因，macOS WebKit 会直接暴力拦截非 HTTP 协议的媒体文件，导致 `MEDIA_ERR_SRC_NOT_SUPPORTED` (Error 4)。
2. 非标准编码：即使把视频转给 HTTP 服务器，如果用户的视频包含杜比音效 (AC-3) 或 10-bit 色深，WebKit 在底层会直接拒绝解码（且不抛出报错），导致只能看见时间轴，而视频区域完全黑屏、点不动。

### 当前解决方案：双管齐下的 "Proxy-First"
为了彻底告别上述噩梦，我们现在的视频导入管线设计为：
1. **强制生成标准代理 (Proxy-First)**：
   不再奢望 WebKit 能播任何格式，我们在导入时调用内置的 FFmpeg，结合 **Apple `h264_videotoolbox` 硬件加速芯片**，将原视频强制快速压制成 720p、H.264 编码、标准的 AAC 双声道 `proxy.mp4` 文件。这牺牲了一点点前期导入时间，换取了后续剪辑时绝对不会黑屏、拖拽极度丝滑的完美保障。
2. **底层内置 HTTP 分段流式服务器 (Axum)**：
   我们放弃了 Tauri 的原生静态文件协议，在 Rust 后端单独起了一个非常轻量的 HTTP 服务器（`tower-http`）。
   它专门负责正确响应 HTML5 `<video>` 的 `HTTP 206 Partial Content (Range)` 分段请求。如果没有这个服务器配合，浏览器是无法直接在时间轴上来回跳转的。

---

## 4. 关键疑问解答 (Q&A)

### Q: 导入时生​​成代理文件，会影响时间轴和时间戳的精确度吗？
**答：不会。**
时间轴（Timestamp）精确度主要取决于**帧率 (FPS)** 和**关键帧容器映射**。
在我们的 ffmpeg 转换命令中，只改变了分辨率和编解码器，**没有更改原始帧率 (FPS)**，也没有进行不均匀的丢帧。因此：
- 转换后的代理文件中，第 1 小时 35 分 12 秒 500 毫秒对应的那一帧，**严格等于**原始高画质文件中的那一帧。
- 在后续开发输出/导出功能时，我们可以依然使用这份 `[startTime, endTime]` 时间戳，去**对原始文件**（而不是较低画质的代理文件）进行无损裁剪 (Stream copy) 提取。

### Q: 剪映、Premiere (PR) 为什么导入能做到“秒开”，它们用了什么技术？
这是一流桌面商业软件与我们这种基于 Web 技术的架构最大的区别：
1. **自有海量解码库 (FFmpeg 深度定制)**：PR 和剪映**不是**运行在浏览器里的。它们在 C++ 底层自带了所有能想到的视频和音频解码器软实现。只要硬件不支持，它们立刻无缝切到 CPU 软解。所以无论丢进去多怪异的格式，它们都能直接在内存里画出画面。
2. **异步后台构建缓存**：专业软件在“秒开”后，如果你立刻拖动进度条，其实也是会卡顿的。它们只不过是优先渲染了开头第一帧，然后**在后台偷偷构建波形图和峰值缓存文件 (`.cfa` / `.pek`) 甚至是代理文件**。如果在它缓存建立完之前你去拖，一样会非常卡。
3. **我们可以采用类似方式吗？**
   *受限于我们当前基于 Web 技术的架构，目前无法完全复刻。*
   目前，唯一能在 Browser 中实现「多格式超级软解播放器」的技术是 WebAssembly (WASM 移植完整版 ffmpeg)，但它的性能极其受限，在现在的 PC 上连 1080p 都难以流畅播放，更别提剪辑和拖拽。
   因此，我们目前使用的 **"硬解码强制转码 (Proxy-First)"** 已经是基于 Tauri / Electron 产品体系下**最稳妥、最高效**的行业普遍解决方案了。

---

## 5. 里程碑完成情况 (Final Phase Accomplishments)

本项目已经完成了基础架构搭建、核心交互重构以及多轮用户反馈的疯狂打磨。以下曾是痛点问题，现已全部提供优雅解法：

### 1. 资产分类与截取系统 (Asset Management & Extraction)
- **侧边资产面板**：左侧内置可折叠 ◀ 面板，涵盖六大类别的统一增删改查。
- **无感存图/存片**：通过封装 Tauri 原生文件插件 (`plugin-fs`)，截取视音频时会自动且静默递归新建各类资产库的专属文件夹并命名存储。修复了此前依赖 Shell `mkdir` 而被权限拦截导致 FFmpeg 保存失败的顽疾。
- **存为音频特性**：视频截取弹窗支持勾选“仅存为音频”，通过底层 `-vn` + `-q:a 0` 参数实现极速 HQ MP3 抽取。

### 2. 极致的时间轴体验 (Advanced Timeline)
- **瞬时高清悬浮预览**：不依赖 FFmpeg 这个性能巨兽去后台狂抽几十万张缩略图，而是在时间轴内部绑定了一个被 CSS `opacity: 0` 隐藏的 `<video>`。当指针 Hover 时立刻 seek 并通过 Canvas 绘制出高清画面悬浮层，做到 0 性能开销即可实现专业剪刀手般的预览体验。
- **绝对锚定缩放**：重写了缩放公式 `(currentTime * newPps) - newScrollLeft === visual_X`，彻底解决了缩放时播放头乱飞的问题。
- **自动推移与对齐**：支持拖拽到屏幕边缘自动翻页，且支持切点在拖动时的就近磁力吸附 (Snapping)。

### 3. 数据隔离与安全打包 (Project Export & Portability)
- **纯粹的文件系统驱动**：所有的状态都实时落盘到工作目录下的 `project.json` 中，随时拷贝工作目录给别人，重新在 App 里 Open 就能实现进度 100% 还原。
- **Rust 原生 ZIP 打包解法 (`.zip`)**：交付时最大的麻烦就是动辄几十个 GB 的代理源视频。为了解决这个问题，我们废弃了不安全的 JS Shell 复制，直接在 `src-tauri/src/lib.rs` 中手写了一套完整的递归式 ZIP 压缩系统。
- **一键脱水**：用户点击「📦 导出打包」后，Rust 后端会瞬间将体积小巧的 `project.json` 及抽取的各种人物、道具图片资产 (`assets/`) 压制成一个单独的 `.zip` 压缩包（自动跳过代理视频），实现毫秒级发给同事。

---

## 6. Phase 7: 功能修复与增强 (2026-03-17)

本轮聚焦于 UI 稳健性、数据完整性和新功能支持。

### 1. 面板级滚动条 (Industry-Standard Panel Scrolling)
- 遵循 Premiere/Resolve/Blender 的标准范式：每个面板 = 独立滚动视口
- 核心 CSS 修复：`min-height: 0` + `flex-shrink: 0`，杜绝内容重叠和挤压
- 涉及：`TextBlocks.css`、`AssetSidebar.css`、`SegmentList.css`、`MainLayout.css`

### 2. 时间轴滚动条冲突修复
- Canvas `onPointerDown` 增加 Y 坐标检测，当点击落在容器底部 16px（浏览器原生滚动条区域）时跳过，不再抢夺滚动事件

### 3. 外挂 + 内嵌字幕支持
- 新建 `subtitleParser.ts`：完整的 SRT 格式解析器
- 新增 `getSubtitleTracks()`：使用 ffprobe `-select_streams s` 探测所有内嵌字幕流
- 新增 `extractSubtitleTrack()`：使用 ffmpeg `-map 0:N -c:s srt` 提取指定字幕轨到临时文件
- 播放控件栏新增 **CC 按钮**，点击弹出 fixed 定位浮层面板（`max-height: 60vh` + 滚动 + click-outside 关闭），列出外挂加载入口和所有内嵌字幕轨
- 视频区域底部新增字幕叠加层，根据当前播放时间实时匹配 Cue 并渲染

### 4. 文件命名
- `AssetSelectModal` 新增「文件名」输入框，预填默认名称（如 `clip_20260317`），用户可自由修改

### 5. 数据模型完善 (project.json)
- **Rust 后端**：`Project` 结构体新增了 `metadata: Option<Metadata>` 和 `assets: Vec<Asset>`，`Asset` 新增 `files: Vec<AssetFile>` 记录每个关联文件的路径、截取时间和类型
- **TypeScript**：新增 `AssetFile` 接口；`addFileToAsset` action 在截图/截取后自动记录文件与时间戳
- `ensure_workspace_dirs` 现在创建统一的 `assets/` 目录而非 legacy `screenshots/clips/thumbnails`

### 6. 跨平台路径兼容
- `saveProject` 时将 `proxyFilePath` 转为相对路径存储（如 `proxy.mp4`）
- `loadProject` 时根据当前 OS 路径分隔符自动还原为绝对路径
- Asset 文件路径始终使用相对路径（如 `assets/character/Andy/screenshot.png`）

### 7. 项目切换
- 顶部标题栏新增「📂 打开文件夹」按钮
- 点击后自动保存当前项目 → 弹出文件夹选择器 → 重新加载新 workspace，无需重启应用

---

## 7. Phase 8: 路径架构重构与帧精确裁切修复 (2026-03-26)

本轮修复了三个相互关联的底层 Bug，并对路径处理架构进行了根本性重构。

### 1. 纯净内存路径架构（彻底解决 Windows 路径污染）

**问题根因：** 旧版 `enterSubProject` 为了让 `VideoPlayer` 能播放视频，会直接把全局 Store 里的相对路径**原地篡改为绝对路径**。这导致用户在二级页面点「保存」时，带有 Windows 盘符的绝对路径（如 `C:\...`）被直接写进 `project.json`，下次再进入时发生路径双重拼接（如 `C:\...\C:\...`）。

**架构决策：** 在 `projectStore.ts` 中导出公共工具函数 `resolveWorkspacePath(workspace, filepath)`，并确立以下不变式：

> **Store 中所有路径永远是纯相对路径，与硬盘文件格式完全一致。消费层（组件）在读取时按需调用 `resolveWorkspacePath` 临时解析为绝对路径。**

这消除了 `enterSubProject`、`exitSubProject`、`saveProject` 中所有路径清洗和拦截逻辑，代码量净减少约 60 行。

### 2. 帧精确裁切语义契约（彻底解决多出一帧）

**语义约定（在 `recalculateSegments` 中确认）：**
- `seg.endTime` = 下一片段的 `startTime` = 切分点时间戳
- 游标停在切分点时，画面显示的是**下一个镜头的第一帧**
- 因此片段裁切范围为 `[startTime, endTime)`，`endTime` 帧**禁止被包含**

**为什么半帧减法不够：** H.264 编码器将每帧圆整到最近的可展示时间戳（PTS）。当截取时长与帧边界过于接近时，FFmpeg 仍可能在 PTS 圆整时「吸入」边界帧。

**最终方案（`ffmpegService.ts`）：** 将视频裁切时长减去**整整一帧**（`1.0 / fps`），给编码器足够的 PTS 余量，从数学上保证边界帧永远不会被触及。音频裁切路径使用完整时长（不受帧边界约束）。

```ts
// 视频裁切：endTime 是独占端点，需减去整一帧
const oneFrame = 1.0 / (fps || 24);
const safeDuration = Math.max(0, duration - oneFrame);
```

### 3. 子项目 endTime 同步修复（彻底解决游标拉不到底）

创建片段子项目时，初始 Segment 的 `endTime` 同步减去一帧，与实际导出的 mp4 文件时长保持一致，消除二级页面拉片时游标无法触底的问题。