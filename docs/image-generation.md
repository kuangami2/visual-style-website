# 《晚些回去》生图脚本

`scripts/generate-images.mjs` 使用 Node 20 自带的 `fetch` 调用 OpenAI-compatible 的 `/images/generations` 接口。它只读取 `.env` 中的配置，不会把 API key 写进输出文件、日志或 manifest。

先运行不产生请求的检查：

```powershell
node scripts/generate-images.mjs --dry-run
```

确认 `.env` 的 `OPENAI_API_KEY` 已配置后，生成第一张主视觉：

```powershell
node scripts/generate-images.mjs `
  --prompt-file scripts/prompts/wan-late-home-hero.txt `
  --slug wan-late-home-hero `
  --size 1536x1024
```

支持的配置如下：

```dotenv
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.shuaiapi.com/v1
OPENAI_IMAGE_ENDPOINT=
OPENAI_IMAGE_MODEL=gpt-image-2.5
OPENAI_IMAGE_SIZE=1536x1024
OPENAI_IMAGE_QUALITY=high
OPENAI_IMAGE_TIMEOUT_MS=180000
OPENAI_IMAGE_DOWNLOAD_TIMEOUT_MS=30000
```

`OPENAI_IMAGE_ENDPOINT` 可直接填完整的 `/images/generations` 地址；未填写时脚本会在 `OPENAI_BASE_URL` 后追加该路径。服务返回 `b64_json` 或临时 `url` 都可以，脚本会统一保存到 `assets/generated/`，并为每张图片生成同名 `.json` 元数据和更新 `manifest.json`。

模型优先采用 `.env` 或进程环境中的 `OPENAI_IMAGE_MODEL`；未配置时使用 `gpt-image-2`。以上 `gpt-image-2.5` 是当前中转服务的配置示例，脚本不会覆盖它。

保存时以实际图片字节签名确定 `.png`、`.jpg`、`.webp` 或 `.gif` 扩展名，不信任服务的文件名或 Content-Type，也不会转码。旧配置中的 `OPENAI_IMAGE_FORMAT` 可保留，但不再强制决定后缀；因此请以生成日志和 manifest 中的文件名接入前端。非图片数据会被拒绝写入。

为保留历史版本，已存在的 slug 默认会在请求前被拒绝；优先使用新的版本名。确实需要覆盖时才加 `--force`。API 和图片下载的超时均覆盖响应正文的读取。API 出错只记录状态码或通用错误，不打印服务返回的错误正文，避免中转服务意外回显密钥。

同一输出目录和 manifest 必须逐条串行生成，等待上一条命令结束后再运行下一条。脚本不支持多个进程同时更新同一 manifest。

图片下载前，脚本先把本次生成的必要元数据和服务返回的图片条目保存到本地 `tmp/imagegen-pending/<slug>.json`。此目录已被 Git 忽略，其中可能有短期图片 URL，不应上传、分享或放入网站公开目录；记录不含 API 密钥。全部图片与 manifest 保存成功后，恢复记录会自动删除。

如果生成已成功但下载失败，使用原来的 slug 恢复即可，无需再次提交提示词：

```powershell
node scripts/generate-images.mjs --resume --slug wreath-garden-v4
```

`--resume` 使用保存的提示词、模型、输出位置及生成时间，仅重试图片下载，不发送新的生图 POST，也不要求配置 API 密钥。每张图片的只读 GET 最多重试 2 次，每次超时由 `OPENAI_IMAGE_DOWNLOAD_TIMEOUT_MS` 控制（15—30 秒，默认 30 秒）；生图 POST 永不自动重试。有恢复记录时，普通生图命令会拒绝再次生成同名 slug，即使使用 `--force` 也不会跳过这一保护。临时 URL 若已过期，恢复仍可能失败，记录会保留，不会自动产生另一笔生图请求。

如果中转服务不接受 `quality` 或 `1536x1024`，可先用兼容参数重试：

```powershell
node scripts/generate-images.mjs --size 1024x1024 --quality medium
```

## 当前上线的素材

正式场景使用 `scripts/prompts/*-v4.txt` 生成的 v5 文件：四张 1536×1024 横图和四张 1024×1536 竖图。六张分镜和对应竖构图使用 v6 文件；历史源图仍保留供比较，网页不再发布旧 v4/v5 派生图。

v4 在暖金侧逆光、青蓝阴影和花叶散景之外，进一步指定透光的象牙白轻纱、珊瑚/玉绿/天青内裙、肌肤的局部明暗与清晰发丝高光。手机图独立生成三人紧凑构图，避免强裁横图丢失人物。提示词固定角色装束和面部描述；独立生成画面仍可能存在细微相貌差异。

如需下一轮生成，复制提示词改用新版本名，逐条运行。示例：

```powershell
node scripts/generate-images.mjs --prompt-file scripts/prompts/flower-field-v4.txt --slug flower-field-v5 --size 1536x1024 --quality high
node scripts/generate-images.mjs --prompt-file scripts/prompts/flower-field-mobile-v4.txt --slug flower-field-mobile-v5 --size 1024x1536 --quality high
```

原始图、实际提示词、模型配置名、哈希与时间保存在 `assets/generated/`。当前 v4 的网页压缩与三位角色头像裁切由 `scripts/prepare-assets.py` 复现（Python + Pillow）：

```powershell
python -m pip install Pillow
npm run assets:prepare
```

该脚本输出当前运行所需的 23 张源 WebP，以及 screen/thumb WebP/JPEG 派生图至 `public/assets/generated/`；`assets/web-manifest.json` 记录源图、尺寸、裁切坐标和哈希。不会改变原始图的光影或色彩。`python scripts/prepare-assets.py --clean` 会在重新生成后删除已知素材族的过期派生图；`npm run assets:check -- --strict` 会阻止缺图、尺寸错误、哈希错误、格式错误和未清理的发布图片进入构建。
