# 拆梦机器导出数据说明

本文档只说明“拆梦机器”导出的数据包长什么样、每个字段表达什么含义，以及哪些字段适合作为上下文、哪些字段是评测参考答案。它不规定 Seedance Studio 当前或未来的数据结构。Studio 侧可以根据自己的最新结构，自行把这些数据映射到项目、Block、Clip、资产或评测答案中。

## 1. 导出包内容

拆梦导出的 zip 以 `project.json` 为核心，辅以 `assets/` 目录中的实际素材文件。

典型结构：

```text
Dedream_Project_Data.zip
├── project.json
└── assets/
    ├── character/
    ├── scene/
    ├── prop/
    ├── visual/
    ├── segment_analysis/
    └── other/
```

导出规则：

| 内容 | 是否包含 | 说明 |
| --- | --- | --- |
| `project.json` | 包含 | 项目所有结构化标注都在这里。 |
| `assets/` | 包含 | 包含人物、场景、道具、视觉设定、片段分析等资产文件。 |
| 手动导入图片 | 包含 | 存在于对应资产目录下，记录在 `assets[].files[]`。 |
| 截图资产 | 包含 | 存在于对应资产目录下，记录在 `assets[].files[]`。 |
| 手动截取的 clip/audio | 包含 | 如果用户明确截取到某个资产下，会作为资产文件导出。 |
| 基础片段 MP4 | 默认不包含 | 导出不会批量切分整片，也会跳过 `assets/segment_clips/`。 |
| 原始视频 | 不包含 | 原始视频通常在工作目录外，路径记录在 `project.videoFilePath`。 |
| 代理视频 | 不保证包含 | `proxyFilePath` 只服务本机播放，不应作为数据转换依赖。 |

## 2. 路径约定

`project.json` 里的素材路径大多是相对路径，以拆梦工作目录为根。导出 zip 后，可以理解为以 zip 解压目录为根。

路径字段包括：

| 字段 | 含义 |
| --- | --- |
| `videoFilePath` | 原始视频路径，可能是工作目录外的绝对路径。 |
| `proxyFilePath` | 本机代理视频路径，可选，不建议用于 Studio 导入。 |
| `subtitleFilePath` | 字幕文件路径，可选。 |
| `assets[].files[].path` | 资产文件路径，通常指向 zip 内 `assets/` 下的文件。 |
| `segments[].references[].filePath` | 小片段挂载的具体参考图片路径。 |
| `segments[].clipPath` | 历史兼容字段，可能指向手动或旧流程生成的片段文件。 |

转换时的建议处理：

- 相对路径按 zip 解压根目录解析。
- 绝对路径先检查本机是否存在。
- 原始视频找不到时，应让用户重新关联原视频。
- 不要因为缺少 `clipPath` 或 `assets/segment_clips/*.mp4` 判定导出失败。

## 3. 项目根字段

`project.json` 顶层字段如下：

| 字段 | 类型倾向 | 含义 |
| --- | --- | --- |
| `metadata` | 对象，可选 | 影片或素材的标题、来源链接、外部 ID。 |
| `videoFilePath` | 字符串 | 原始视频路径，是后续按时间切片的依据。 |
| `proxyFilePath` | 字符串，可选 | 本机播放代理路径。 |
| `subtitleFilePath` | 字符串，可选 | 字幕文件路径。 |
| `segments` | 数组 | 全片切分得到的基础小片段。 |
| `textBlocks` | 数组 | 影片级文本信息，例如剧本、Meta、题目、故事梗概。 |
| `sceneBlocks` | 数组 | 用户标注的分场信息，一个场对应若干小片段。 |
| `assets` | 数组 | 人物、场景、道具、视觉设定、片段分析等资产。 |
| `createdAt` | 字符串 | 项目创建时间。 |
| `updatedAt` | 字符串 | 项目更新时间。 |

`metadata` 内常见字段：

| 字段 | 含义 |
| --- | --- |
| `title` | 影片或素材标题。 |
| `sourceUrl` | 来源链接。 |
| `videoId` | 外部 ID，例如 IMDb ID 或内部记录 ID。 |

## 4. 影片级文本 textBlocks

`textBlocks` 是一组通用文本模块。每个文本模块通常包含：

| 字段 | 含义 |
| --- | --- |
| `id` | 文本模块 ID。 |
| `title` | 用户看到的标题。 |
| `content` | 文本内容。 |
| `blockType` | 文本类型。 |
| `sortOrder` | 排序。 |

当前 `blockType` 的含义：

| `blockType` | 含义 | 数据用途建议 |
| --- | --- | --- |
| `movieMeta` | 影片 Meta，例如片名、年代、风格、影像规格等。 | 适合作为项目级元信息或全局上下文。 |
| `screenplay` | 剧本全文。 | 适合作为剧本来源或全局上下文。 |
| `userPrompt` | 题目 / User Prompt。 | 更适合作为评测输入，不建议混入项目上下文。 |
| `synopsis` | 故事梗概。 | 适合作为项目级上下文。 |
| `mainPlot` | 大情节。 | 可作为项目级或场级组织信息。 |
| `subplot` | 小情节。 | 可作为局部情节信息。 |
| `act` | 幕。 | 可作为分段组织信息。 |
| `custom` | 自定义文本。 | 由转换方按标题和内容自行判断。 |

## 5. 基础小片段 segments

`segments` 是拆梦最基础的切片结果。每个元素代表原视频中的一个时间区间。

常见字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 片段 ID。 |
| `index` | 片段编号，通常从 1 开始，用于界面展示和分场范围引用。 |
| `startTime` | 片段开始时间，单位为秒。 |
| `endTime` | 片段结束时间，单位为秒。 |
| `description` | 片段描述。 |
| `category` | 片段类别，例如正常、片头、片尾、特殊切镜等。 |
| `notes` | 片段备注，可选。 |
| `references` | 当前片段挂载的参考素材，可选。 |
| `clipPath` | 历史兼容字段，可选。 |
| `isCutError` | 切分异常标记，可选。 |

重要约定：

- `startTime` 和 `endTime` 是还原 Clip 视频素材的关键字段。
- 拆梦导出包默认不带基础片段 MP4。
- 如果 Studio 需要每个小片段的视频文件，应在导入或后处理阶段根据原视频和起止时间统一切片。
- `references` 记录这个片段需要挂载哪些参考图片。

`references` 中每个元素通常包含：

| 字段 | 含义 |
| --- | --- |
| `assetId` | 被引用资产的 ID。 |
| `filePath` | 被引用的具体图片路径。 |

## 6. 分场 sceneBlocks

`sceneBlocks` 用来记录“一个场对应哪些基础小片段”。这是为了保留 Studio 中 Block 与拆梦小片段之间的关系。

每个分场常见字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 分场 ID。 |
| `sceneInfo` | 用户填写的场次基本信息，例如“第 3 场 / 雨夜茶馆”。 |
| `startSegmentIndex` | 该场覆盖的首个片段编号，闭区间。 |
| `endSegmentIndex` | 该场覆盖的最后片段编号，闭区间。 |
| `summary` | 这一场的摘要。 |
| `detail` | 这一场的详细分析。 |
| `sortOrder` | 排序。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |

语义约定：

- `summary` 是上下文型信息，可以给 Studio 作为场级描述或上下文来源。
- `detail` 是参考答案型信息，主要用于评测、标注答案或模型输出对照，不应直接放进 Project Context。
- `startSegmentIndex` 和 `endSegmentIndex` 使用的是 `segments[].index`，不是数组下标。
- 如果一个场覆盖 3 到 7，则表示这个场包含 `index` 为 3、4、5、6、7 的基础小片段。

## 7. 资产 assets

`assets` 存储人物、场景、道具、视觉设定、片段分析等信息。每个资产可以有文字描述，也可以包含多个文件。

资产常见字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 资产 ID。 |
| `name` | 资产名称。 |
| `category` | 资产分类。 |
| `description` | 资产 Summary。 |
| `detail` | 资产 Detail。 |
| `createdAt` | 创建时间。 |
| `files` | 资产文件列表。 |
| `subProjectData` | 片段分析子项目，可选。 |

当前资产分类：

| `category` | 含义 |
| --- | --- |
| `character` | 人物。 |
| `scene` | 场景。 |
| `prop` | 道具。 |
| `visual` | 视觉设定。 |
| `segment_analysis` | 片段分析。 |
| `other` | 其它资产。 |

资产文字字段语义：

- `description` 是 Summary，适合作为上下文或资产描述。
- `detail` 是 Detail，主要作为参考答案、标注答案或模型输出对照，不应直接放进 Project Context。

## 8. 资产文件 files

每个资产下可以有多个文件。文件常见字段：

| 字段 | 含义 |
| --- | --- |
| `path` | 文件路径，通常指向 zip 内的 `assets/` 文件。 |
| `timestamp` | 截取时间点，单位为秒，可选。 |
| `type` | 文件类型。 |
| `tags` | 文件级标签数组，可选。 |

当前文件类型：

| `type` | 含义 |
| --- | --- |
| `screenshot` | 图片参考素材。截图和用户手动导入图片都会使用这个类型。 |
| `clip` | 用户手动截取的视频资产。 |
| `audio` | 用户手动截取的音频资产。 |

标签规则：

- `tags` 是文件级标签，不是资产级标签。
- 同一个人物资产下可能有多张图，每张图可以有不同标签。
- 标签适合表达造型、服饰、景别、状态、场景条件等。
- 例如同一人物下，不同图片可以分别标注“朝服”“夜景”“近景”等。

## 9. 片段分析子项目 subProjectData

当 `assets[].category` 为 `segment_analysis` 时，该资产可能带有 `subProjectData`。

含义：

- 它是一个嵌套的拆梦项目数据。
- 常用于进入某个已截取片段的拉片环境后继续分析。
- `subProjectData` 内部仍然有自己的 `segments`、`textBlocks`、`sceneBlocks`、`assets` 等字段。

处理建议：

- 如果 Studio 暂时不需要片段分析子项目，可以先作为附加标注数据保留。
- 如果需要更细粒度分析，可以递归读取 `subProjectData`，按同一套字段语义解析。
- 子项目的视频来源通常来自该 `segment_analysis` 资产下的 `clip` 文件。

## 10. 上下文与参考答案边界

为了避免评测泄漏，转换时需要区分“可输入给 Agent 的上下文”和“只能用于评测对照的参考答案”。

适合作为上下文的数据：

| 来源 | 字段 |
| --- | --- |
| 影片 Meta | `textBlocks[blockType=movieMeta].content` |
| 故事梗概 | `textBlocks[blockType=synopsis].content` |
| 剧本全文 | `textBlocks[blockType=screenplay].content` |
| 分场摘要 | `sceneBlocks[].summary` |
| 资产摘要 | `assets[].description` |
| 片段描述 | `segments[].description` |

不应直接放入 Project Context 的数据：

| 来源 | 字段 | 原因 |
| --- | --- | --- |
| 分场详细分析 | `sceneBlocks[].detail` | 这是场级参考答案或标注答案。 |
| 资产详细分析 | `assets[].detail` | 这是资产级参考答案或标注答案。 |
| 题目 / User Prompt | `textBlocks[blockType=userPrompt].content` | 它更像评测输入，不是背景上下文。 |

## 11. 最小还原流程

拿到拆梦导出 zip 后，外部系统只需要按以下步骤读取数据：

1. 解压 zip。
2. 读取 `project.json`。
3. 按解压目录解析 `assets[].files[].path` 和 `segments[].references[].filePath`。
4. 读取 `textBlocks`，获得影片级文本。
5. 读取 `segments`，获得每个小片段的起止时间、描述、备注和参考素材。
6. 读取 `sceneBlocks`，获得每个场覆盖哪些小片段，以及场级 Summary / Detail。
7. 读取 `assets`，获得人物、场景、道具、视觉设定等资产及其文件。
8. 如果需要 Clip 视频文件，根据 `videoFilePath` 和 `segments[].startTime/endTime` 在下游统一切片。
9. 如果 `videoFilePath` 指向的原始视频不存在，让用户重新关联原视频。
10. 导入 Studio 时，由 Studio 侧根据自己的最新数据结构完成映射。

## 12. 校验建议

转换方建议检查：

- `project.json` 存在且可解析。
- `segments`、`textBlocks`、`sceneBlocks`、`assets` 缺失时能按空数组兼容。
- `segments[].startTime` 小于 `segments[].endTime`。
- `sceneBlocks[].startSegmentIndex/endSegmentIndex` 能匹配到对应的 `segments[].index`。
- `segments[].references[].filePath` 能找到具体资产文件。
- 作为图片参考素材的 `AssetFile.path` 在 zip 中存在。
- 不要求 zip 中存在基础片段 MP4。
- 不把 `sceneBlocks[].detail` 和 `assets[].detail` 注入上下文。

## 13. 兼容说明

- 旧项目可能没有 `sceneBlocks`、`references`、`tags`、`detail` 或 `notes`。
- 旧项目可能残留 `clipPath`，但新导出流程不依赖它。
- 手动导入图片和截图在数据上都表现为 `type = screenshot`。
- 拆梦后续可能继续增加通用字段；转换方应忽略未知字段，避免解析失败。
