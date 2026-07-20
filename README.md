# 我们的武大

面向 iPhone 15 Pro / iOS 26 的双人私密地点与回忆 PWA。地点以 WGS-84 保存，在高德兼容底图上转换为 GCJ-02 显示；地点、回忆和照片在浏览器端加密后再写入 IndexedDB 或同步服务。

## 本地运行

需要 Node.js 22.12 或更高版本。在 Windows PowerShell 执行策略为 `Restricted` 时，使用 `.cmd` 入口即可，无需修改系统策略。

```powershell
npm.cmd install
npm.cmd run dev
```

打开 `http://127.0.0.1:5173/`。首次进入会创建共同口令；口令无法由服务器找回，请使用密码管理器保存。

## 环境配置

将 `.env.example` 复制为 `.env.production.local` 并填写发布环境配置：

- `VITE_BASE_PATH`：静态站点路径。GitHub Pages 使用 `/wuhan-uni-guide/`，根域名使用 `/`。
- `VITE_SYNC_API`：Cloudflare Worker 的 HTTPS 地址；留空时为纯本机模式。
- `VITE_MAP_TILE_URL`：具有生产授权的 GCJ-02 栅格瓦片模板，必须包含 `{x}`、`{y}`、`{z}`，可选 `{s}`。
- `VITE_MAP_ATTRIBUTION`：地图服务商要求的署名。

生产构建不会回退到开发用瓦片地址。若使用非 `*.is.autonavi.com` 的地图域名，还必须同步更新 `index.html` 的 CSP `img-src`。

## 验证

```powershell
npm.cmd run typecheck
npm.cmd run worker:typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run worker:test
npm.cmd run build
npm.cmd run worker:check
npx.cmd playwright test --project=iphone-chromium
npm.cmd audit
```

WebKit 测试需要先安装 Playwright WebKit：`npx.cmd playwright install webkit`。在无法下载浏览器运行时的网络环境中，可先保留 Chromium 结果，再在实体 iPhone 上完成验收。

## Cloudflare 同步服务

1. 创建 D1：`npx.cmd wrangler d1 create whu-couple-map`，将返回的 `database_id` 写入 `wrangler.jsonc`。
2. 创建 R2：`npx.cmd wrangler r2 bucket create whu-couple-map-media`。
3. 检查 `ALLOWED_ORIGINS`，只保留正式站点和需要的本地地址。
4. 应用迁移：`npx.cmd wrangler d1 migrations apply whu-couple-map --remote`。
5. 验证：`npm.cmd run worker:check`。
6. 获得部署授权后执行：`npx.cmd wrangler deploy`。

Worker 只保存认证校验值和 AES-GCM 密文，不接收共同口令或解密密钥。D1 与 R2 仍应按私密数据配置访问控制、备份和日志保留策略。

## 旧版数据迁移

- 同一站点来源升级时，创建安全空间后会自动读取旧版 `whu_guide_*` 本地数据并转为加密记录。
- 跨域名或跨设备迁移时，在旧版导出地点 JSON，然后在新应用“设置 -> 导入旧版 JSON”中导入。
- 导入前保留原始文件的离线备份；导入后核对地点数、回忆数、坐标和照片。外部照片地址失效时，文本记录仍会保留。

## 发布阻断项

- 撤销 Git 历史中曾暴露的 GitHub Token，并在得到仓库所有者授权后清理公开历史。
- 配置具有发布许可的地图瓦片源及域名白名单。
- 部署 D1、R2 和 Worker 后，在实体 iPhone 15 Pro 上验证安装、离线启动、安全区、照片权限和后台恢复。
- 未经明确授权，不执行 GitHub Pages 或 Cloudflare 生产部署。
