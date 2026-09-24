# 开发与发布

## 本地开发

需要 Node 20+。首次安装并运行：

```powershell
npm ci
npm run dev
```

提交前运行：

```powershell
npm run build
npm run images:check
npm run assets:check -- --strict
npm run test:e2e
npm audit --registry=https://registry.npmjs.org
```

E2E 测试会启动 Vite preview，使用 Playwright 检查移动端溢出、sessionStorage 恢复、花环分享参数和 lightbox 键盘行为。若环境没有默认 Chromium，可设置 `CHROME_PATH`；CI 使用 Playwright Chromium。

## 素材更新

生成源图只写入 `assets/generated/`，不要把 API key 或 `.env` 放进提交。确认源图后运行：

```powershell
npm run assets:prepare
npm run assets:check -- --strict
```

确认版本切换完成后，可以运行 `python scripts/prepare-assets.py --clean` 清理已知素材族的旧派生图。源图和生成 manifest 仍保留在 `assets/generated/`。

## 发布

GitHub Actions 在 `main` 分支执行构建、素材校验和 E2E smoke test，然后发布 `dist/` 到 GitHub Pages。当前环境直接向 Gitee push 会被网络代理拦截时，使用 Gitee 的“从 GitHub 导入”同步仓库，再由 Gitee 侧执行后续发布流程。
