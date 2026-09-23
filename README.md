# 晚些回去 · 花朝游记

在线体验：https://kuangami2.github.io/visual-style-website/

一段关于花、朋友和落日的新中式互动游记。采三朵花、编花环、递青梅，再约一至三位朋友听风、交换花环或讲一件小事。结尾可分享选择，导出横屏与竖屏各六张图片及 JSON、CSV、SRT。

## 运行和部署

需要 Node 20+（部署使用 Node 22）。

```powershell
npm ci
npm run dev
npm run build
npm run preview
```

GitHub Pages 由 `.github/workflows/deploy.yml` 构建并发布 `dist/`。推送到 `main` 后自动部署；本地 `.env`、制作记录缓存、参考图、归档和 node_modules 不会上传到站点。

## 图片制作

本地 `.env` 保存已配置的中转 API 信息，浏览器没有生图接口或密钥。`npm run images:check` 只验证配置，不产生生成请求。

正式图使用 `scripts/prompts/*-v4.txt`，原始图与元数据保存在 `assets/generated/`；网页使用 `public/assets/generated/` 的 8 张横竖 WebP 场景与 3 张头像。准备脚本、断点下载恢复和版本管理见 `docs/image-generation.md`。

## 验收与说明

- `docs/design-review.md`：本轮复盘、已实施优化与测试范围。
- `docs/audio-design.md`：背景音乐来源、CC0 授权和播放说明。
- `docs/project-research.md`：设计研究及项目定位。

原错误代码分析网站和素材归档在本机 `tmp/archive-wrong-code-analysis/`；参考图和旧运行素材归档在 `tmp/archive-reference-runtime/`。这些本地备份不进入 Git 或公开站点。
