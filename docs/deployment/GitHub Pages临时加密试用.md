# 标看看｜GitHub Pages 临时加密试用

> 对应需求：[PRD_002A｜GitHub Pages 临时加密试用](../prd/PRD_002A_GitHub_Pages临时加密试用.md)
>
> 适用时间：ICP 审核期间。这里只处理 GitHub Pages，不修改 ECS、域名、DNS 或正式账号系统。

## 1. 发布结果

- `/`、`/radar/`、`/radar/project/` 和 `/radar/admin/` 首次访问都显示同一个解锁页；
- 密码正确后才在浏览器内解密标讯快照；
- IndexedDB 保存不可导出的派生 CryptoKey、`keyVersion` 和过期时间，不保存密码；
- 同一浏览器 30 天内自动解锁；无痕窗口、新设备、清除网站数据、凭证过期或 `keyVersion` 变化后重新输入；
- Pages 只发布 `data/radar.enc.json`，不发布明文 `data/radar.json`；
- GitHub Actions Secret 缺失、为空、加密失败或产物审计失败时，工作流停止，不上传 Pages 产物。

静态加密只能提高临时试用的访问门槛。公开密文可以被下载并离线尝试密码，因此临时密码不适合长期使用，也不能代替正式账号系统。

## 2. 本地安全构建

本地不能把密码写进 `.env`、脚本、命令历史或测试文件。打开终端后使用隐藏输入：

```bash
cd "/项目目录/标看看"
read -r -s -p "本地测试密码：" BIAOKANKAN_PREVIEW_PASSWORD
printf '\n'
export BIAOKANKAN_PREVIEW_PASSWORD
pnpm run build:pages
unset BIAOKANKAN_PREVIEW_PASSWORD
```

测试使用自行输入的本地模拟密码，不需要和 GitHub Secret 相同。构建成功后：

```bash
test ! -e pages-dist/data/radar.json
test -s pages-dist/data/radar.enc.json
pnpm exec vite preview --config vite.pages.config.ts
```

浏览器打开 Vite 给出的本地地址，使用刚才的模拟密码测试。测试结束后关闭预览进程；`pnpm run clean` 可以清理生成的 `pages-dist`。

验证失败关闭：

```bash
unset BIAOKANKAN_PREVIEW_PASSWORD
pnpm run build:pages
```

预期构建失败，并提示缺少 `BIAOKANKAN_PREVIEW_PASSWORD`；即使失败，`pages-dist` 也不应出现明文 `radar.json`。

## 3. GitHub Secret 设置位置

在仓库中进入：

```text
Settings
→ Secrets and variables
→ Actions
→ Repository secrets
→ New repository secret
```

名称必须完全一致：

```text
BIAOKANKAN_PREVIEW_PASSWORD
```

值由产品负责人自行填写。不要把值粘贴到 Issue、PR、Actions 输入框、代码或文档中。工作流只在加密构建步骤读取该 Secret，构建脚本不会输出密码。

## 4. 首次安全发布

1. 先确认 Repository Secret 已存在，再推送包含加密工作流的代码；
2. 确认 `deploy/pages/preview-crypto.json` 中 PBKDF2 迭代次数不少于 600,000；
3. 提交和推送代码后，进入 `Actions`；
4. 打开 `Refresh data and deploy encrypted preview`；
5. 使用 `Run workflow` 手动执行，或查看 `main` 分支推送触发的运行；
6. 只有 `Build encrypted static site` 和全部测试成功后，才会出现上传与部署步骤；
7. 日志只能显示 `keyVersion`，不能显示密码、项目明文或完整密文。

本地开发完成不等于发布。本项目不会由开发脚本直接修改 GitHub Secret，也不会自动替用户提交或推送代码。

## 5. 更换临时密码

更换 GitHub Secret 时必须同时生成新的随机盐和 `keyVersion`：

```bash
pnpm run rotate:pages-key
```

该命令不读取密码，只更新 `deploy/pages/preview-crypto.json`。把新配置和使用新 Secret 的发布安排在同一次变更中。发布后，所有浏览器的旧 CryptoKey 会因 `keyVersion` 不同而失效，并重新显示解锁页。

密码不变时不要运行这个命令。日常数据更新沿用同一盐和 `keyVersion`，每次加密仍自动生成新的随机 IV，所以 30 天本地凭证可以继续解密新数据。

## 6. 公开地址验收

发布后使用无痕窗口逐一直接打开：

```text
https://octopusgump.github.io/biaokankan/
https://octopusgump.github.io/biaokankan/radar/
https://octopusgump.github.io/biaokankan/radar/project/?id=任一真实ID
https://octopusgump.github.io/biaokankan/radar/admin/
```

四个地址都必须先显示解锁页。然后检查：

```bash
curl -i https://octopusgump.github.io/biaokankan/data/radar.json
curl -fsS https://octopusgump.github.io/biaokankan/data/radar.enc.json
```

第一条应为 404；第二条只能看到 `keyVersion`、PBKDF2 参数、随机 IV 和密文。任取一个真实完整项目名称，在已下载的 Pages 产物中搜索，结果必须为空。

正确密码应进入网站，错误密码应停留在解锁页。关闭并重新打开普通浏览器应自动解锁；无痕窗口或清除网站数据后应重新要求密码。

## 7. 公开仓库边界

当前 GitHub 仓库是 Public。Pages 产物加密不会自动隐藏仓库源码中已经提交过的 `public/data/radar.json`，也不会清除 Git 历史版本。

如果要求所有公开入口都不能读取明文快照，首次加密发布前还必须完成其中一种处理：

1. 将仓库改为 Private，并确认当前 GitHub 套餐仍允许 Pages 发布；或
2. 另立任务，把明文快照移出 Git 仓库，只允许 Actions runner 在构建期间短暂生成。

本轮没有修改仓库可见性，也没有删除、改写或清理 Git 历史。
