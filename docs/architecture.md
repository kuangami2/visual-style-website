# 架构说明

## 页面与状态

项目是静态 Vite + React 应用。`src/main.tsx` 负责旅程编排，章节、朋友、花材、活动和分镜目前以类型化常量保存。用户状态包括当前章节、最远章节、采花、花环槽位、赠梅对象、同行者和收束活动。

未完成状态以版本化快照写入当前标签页的 `sessionStorage`。读取时会检查版本、枚举值、数组长度和数字范围。带有有效 `friends` 参数的完成页 URL 优先级高于本地快照，并会清理快照；点击重新游历会同时清理 URL 和快照。

## 分享与导出

完成页 URL 保存 `friends`、`activity`、`flowers`、`woven` 和可选的 `plum`。`woven` 使用 `slot-flower` 对表示四个花环槽位的花材选择。浏览器端导出 ZIP，不上传用户选择；ZIP 包含横竖 JPG、JSON、CSV、SRT 和 README。

## 图片与素材

原始生成图、提示词和生成元数据位于 `assets/generated/`。`scripts/prepare-assets.py` 生成发布派生图到 `public/assets/generated/`：每个运行时源图拥有原图、screen WebP/JPEG 和 thumb WebP/JPEG。`scripts/check-assets.mjs --strict` 校验 manifest、源图与派生图的尺寸、格式和 SHA-256，并扫描源码引用。旧派生图通过 `python scripts/prepare-assets.py --clean` 清理；该命令只处理已知素材前缀。

首屏只预加载第一章当前 viewport 所需的 screen 图，后续章节和分镜图由页面实际渲染触发懒加载。移动端使用独立竖构图。

## 声音

背景音乐是用户点击后加载的本地 CC0 音频，默认关闭。采花和编环短音效使用 Web Audio API；标签页隐藏时背景音乐暂停。
