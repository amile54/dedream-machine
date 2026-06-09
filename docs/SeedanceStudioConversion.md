# Seedance Studio 转换说明

本文档描述如何把拆梦机器的通用项目数据转换为 Seedance Studio 项目数据。拆梦仍然保持自己的 `project.json` 结构，不直接内嵌 Studio 专用字段。

## 拆梦项目数据

拆梦工作目录的核心数据在 `project.json`：

- `metadata.title`: 影片或素材标题。
- `metadata.sourceUrl`: 来源链接。
- `metadata.videoId`: 外部 ID。
- `segments[]`: 全片切分后的基础片段。
- `textBlocks[]`: 通用分析文本框；其中 `blockType === "screenplay"` 表示剧本全文，`blockType === "movieMeta"` 表示影片 Meta，`blockType === "userPrompt"` 表示题目 / User Prompt。
- `sceneBlocks[]`: 分场列表，用于记录一场对应的片段范围，以及该场的 Summary / Detail。
- `assets[]`: 人物、场景、道具、视觉设定、片段分析等资产。
- `assets[].files[]`: 资产下的具体文件，例如截图、clip、audio。

`AssetFile` 结构：

```ts
interface AssetFile {
  path: string;
  timestamp?: number;
  type: 'screenshot' | 'clip' | 'audio';
  tags?: string[];
}
```

`tags` 是文件级标签，适合表达同一人物或场景在某张图片中的具体状态，例如 `["青衣", "夜景"]`。标签不属于整个人物资产，因为同一人物资产可以包含多张不同造型图片。

`Segment.references` 用于记录小片段挂载的参考素材：

```ts
interface SegmentReference {
  assetId: string;
  filePath: string;
}
```

`filePath` 指向某个资产里的具体图片文件，通常是 `AssetFile.type === 'screenshot'` 的文件。转换到 Studio 时，应把这些图片作为对应 clip / plot 生产时的 reference images。

导出打包时，拆梦不在本机批量转码基础片段 MP4。导出包只保证每个基础片段的起止时间和标注元信息完整记录在 `segments[]` 中，Studio 转换方或后续开发机批处理应按这些时间统一切片：

```ts
interface Segment {
  index: number;
  startTime: number;
  endTime: number;
  clipPath?: string;
}
```

`clipPath` 仅用于兼容历史或手动生成的片段视频路径。新的导出包不要求该字段存在，也不保证包含 `assets/segment_clips/*.mp4`。转换方应优先使用 `startTime` / `endTime` 从原始视频或集中式转码流程生成 Studio 需要的 Clip 素材。

`SceneBlock` 结构：

```ts
interface SceneBlock {
  id: string;
  sceneInfo: string;
  startSegmentIndex: number;
  endSegmentIndex: number;
  summary: string;
  detail: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

字段语义：

- `summary`: 场级 Summary，可作为 Studio Block / Project Context 的候选输入。
- `detail`: 场级详细分析，是评测参考答案或 Agent 推理结果对照，不应直接导入 Studio Project Context。
- `startSegmentIndex` / `endSegmentIndex`: 该场覆盖的拆梦片段编号闭区间。

`Asset` 的文本字段语义：

- `description`: 资产 Summary，可作为 Studio Context 或资产描述输入。
- `detail`: 资产分析 Detail，是评测参考答案或模型答案对照，不应直接导入 Studio Project Context。

## 建议 Studio 转换规则

### 表格项目覆盖映射

对照《Studio Project 物料详细拆解》表格，拆梦导出包中的覆盖关系如下：

| 表格项 | 拆梦字段 | 导出覆盖 |
| --- | --- | --- |
| 剧本全文 | `textBlocks[].blockType === "screenplay"` | `project.json` |
| 故事大纲 | `textBlocks[].blockType === "synopsis"` | `project.json` |
| meta | `textBlocks[].blockType === "movieMeta"` | `project.json` |
| 题目 / user prompt | `textBlocks[].blockType === "userPrompt"` | `project.json` |
| 主要人物 / 场景 / 道具 summary | `assets[]` 按 `category` 分组后的 `description` | `project.json` |
| 人物 / 场景 / 道具 summary | 单个 `assets[].description` | `project.json` |
| 人物 / 场景 / 道具详细分析 | 单个 `assets[].detail` | `project.json` |
| 人物主图、人物造型图、场景图、道具图 | `assets[].files[]`，以 `tags` 区分主图 / 造型等 | `project.json` + `assets/` 文件 |
| 分场剧本 / 分场 summary | `sceneBlocks[].summary` | `project.json` |
| 分场分镜分析 | `sceneBlocks[].detail` | `project.json` |
| 分场素材引用 | 由 `sceneBlocks[].startSegmentIndex/endSegmentIndex` 覆盖的 `segments[].references[]` 汇总得到 | `project.json` + `assets/` 文件 |
| 分场 clips | 由 `sceneBlocks[].startSegmentIndex/endSegmentIndex` 覆盖的 `segments[].startTime/endTime` 批量切片得到 | `project.json` + 下游批处理生成的视频 |

### 影片 Meta

`textBlocks[]` 中 `blockType === "movieMeta"` 的文本框用于记录影片级元信息，例如片名、年代、类型、整体风格、影像规格或评测集需要的其他全局说明。转换到 Studio 时，可以把它作为项目级元数据或全局 Context 的候选输入。

### 剧本全文与题目

`textBlocks[]` 中 `blockType === "screenplay"` 的文本框用于记录剧本全文。虽然表格里写“文件格式不限”，拆梦当前以通用文本框记录；如果后续需要挂载 PDF / DOCX 等源文件，可以扩展为资产文件，但 Studio 转换方现在应优先读取这个文本框。

`textBlocks[]` 中 `blockType === "userPrompt"` 的文本框用于记录评测题目或用户提示词。转换到 Studio 时，可作为生成任务的用户输入或评测 prompt。

### 片段到 Plot

如果只需要片段级评测，可以将 `segments[]` 中每个基础片段转换为一个 Studio `plot` block：

- `id`: 可使用 `plot_<segment.index>` 或稳定 hash。
- `kind`: `plot`。
- `num`: `segment.index` 的补零编号，例如 `001`。
- `label`: `片段 <index>` 或从 `segment.description` 提取短标题。
- `body`: 写入 `segment.description`、`segment.notes`、起止时间、类别。
- `references`: 映射为该 plot / clip 的参考图列表，按 `filePath` 找到具体图片。

如果需要 Studio 的“场”级 Block，应优先使用 `sceneBlocks[]`：

- `sceneInfo` 可作为 Studio block 的场次编号或标题。
- `startSegmentIndex` / `endSegmentIndex` 记录该场覆盖的拆梦片段范围。
- `summary` 可作为 Studio Context。
- `detail` 应作为参考答案、标注答案或 Agent 推理结果对照，不要直接写入 Studio Project Context。

### 片段 Clip 资产

如果转换方需要把片段视频作为 Studio timeline library 的素材，应把每个片段切成单独 mp4，并登记为 Studio 项目资产：

- `category`: `plot_keyframes`。
- `kind`: `video`。
- `role`: `take`。
- `owner_block_id`: 对应 plot block id。
- `local_path`: `plot_keyframes/<asset_id>.mp4`。
- `local_url`: `/api/project/<project_id>/asset/<asset_id>`。
- `duration_seconds`: `segment.endTime - segment.startTime`。

拆梦导出包默认不包含这些片段视频。转换方应使用 `segment.startTime` / `segment.endTime` 从原始视频或统一素材服务批量生成 MP4；如果历史项目中 `segments[].clipPath` 已存在且文件也在导出包内，可以作为兼容路径复用。

拆梦仍保留 clip 导出服务，供手动截片段或后续批处理复用。转换方可以使用 720p 左右的低成本素材：

```ts
exportClip(input, start, end, output, false, fps, {
  maxHeight: 720,
  quality: 'balanced',
});
```

质量档位建议：

- `high`: CRF 22。
- `balanced`: CRF 26，推荐用于评测集准备。
- `small`: CRF 30。

未传参数时，拆梦保留原有手动截片段行为：不缩放、CRF 18。

### 人物与场景参考图

将拆梦 `assets` 中的 `character` 和 `scene` 转换为 Studio 的人物/场景 block 或参考资产：

- `asset.name` 可作为 block label。
- `asset.description` 是 Summary，可作为 Studio Context。
- `asset.detail` 是 Detail，应作为参考答案、标注答案或模型答案对照，不要直接写入 Studio Project Context。
- `file.type === 'screenshot'` 的文件可作为参考图。
- `file.tags` 应保留为转换后的资产 metadata，例如 `tags`、`look_tags` 或 `style_tags`。

如果 Studio 需要区分同一人物的不同造型，可以按 `file.tags` 将同一人物下的图片分组，但不建议反向要求拆梦把这些造型拆成多个人物资产。

## 边界约定

- 拆梦的原始视频路径仍可能是工作目录外的绝对路径；转换方应在切片阶段要求用户重新关联缺失原视频。
- 拆梦 `project.json` 中的相对文件路径以工作目录为根。
- Studio 专用字段应由转换器生成，不写回拆梦项目，避免影响拆梦的通用用途。
