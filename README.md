# 标看看｜监理标讯助手

帮监理企业更早发现值得跟进的标讯。网站集中展示真实扫描发现的监理项目、投标截止时间、招标人、代理机构与信息来源，并提供信息源管理和扫描异常查看能力。

## 产品文档

- [首版 PRD](./docs/prd/PRD_001_监理招标信息雷达_首版.md)
- [黑蓝工作台设计系统](./docs/design/DESIGN_SYSTEM.md)
- [部署与运维文档](./docs/deployment/README.md)
- [全部项目文档](./docs/README.md)

## 本地运行

需要 Node.js 22.13 或更高版本。仓库使用 pnpm 锁定依赖版本；已安装依赖时，日常只需运行启动命令。

```bash
pnpm install
pnpm run dev
```

访问 `http://localhost:3000/`。

## 真实扫描 MVP

本版抓取已经适配的公开来源。新来源先由开发完成抓取适配和本地验证，再进入每日扫描；未识别的网站不会直接写入线上数据。

```bash
# 抓取公开公告并更新 public/data/radar.json
pnpm run crawl

# 验证字段提取、截止状态和链接筛选
pnpm run test:crawler
```

GitHub Pages 工作流每天北京时间 07:30 自动运行一次，也支持在 GitHub Actions 中手动触发。Pages 当前是 ICP 审核期间的临时加密试用入口；用户先解锁，浏览器再读取密文快照。每次运行会：

1. 访问七个来源的公开公告列表或公开查询接口；
2. 只保留语义明确的监理招标公告；
3. 提取项目、标段、投资、截止时间、招标人和代理机构；
4. 与上一次快照对比，生成新增、更新和异常记录；
5. 使用 Actions Secret 加密快照，删除发布目录中的明文数据；
6. 产物审计通过后发布静态页面。单个来源失败时会保留该来源上次成功数据。

本地加密测试和 GitHub Secret 设置见[《GitHub Pages 临时加密试用》](./docs/deployment/GitHub%20Pages临时加密试用.md)。真实密码不能写入代码、文档、测试或本地 `.env` 文件。

定时抓取结果使用稳定的 JSON 契约，由 `crawler/storage.mjs` 统一读写。当前线上版本只读取发布后的 JSON 快照，不依赖云端数据库或网页写入接口。

## 构建

```bash
# 完整应用构建
pnpm run build

# 中国大陆服务器静态部署包
pnpm run build:china
```

国内部署包输出到 `china-dist`。ICP备案、域名和大陆服务器的准备步骤见[《国内上线与 ICP 备案清单》](./docs/deployment/国内上线与ICP备案清单.md)。

构建完成后如需恢复整洁的项目目录，可以运行：

```bash
pnpm run clean
```

该命令只删除可重新生成的本地构建产物和缓存，不删除源码、`public/data/radar.json` 真实数据或 `node_modules`。

## 正式上线前

在 `app/site-config.ts` 填写营业执照主体全称、服务联系方式，以及审核通过后的 ICP 与公安备案信息。未取得备案号前不要填写虚假号码。

当前项目列表、链接状态和每日汇总来自真实公开网页抓取。本版不提供企业微信消息预览、模拟发送或真实推送。所有自动提取字段都应以原公告和招标文件为最终依据。
