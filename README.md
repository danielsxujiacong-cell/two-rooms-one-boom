# 两室一弹

《两室一弹》是一个为 10 月 5 日游戏之夜准备的中文互动海报。任何访客都可以匿名按下炸弹；Supabase 以数据库原子操作保存全球共享总数。

## 状态

- 阶段：V1 页面与部署配置已完成，等待 Supabase 项目设置与线上验收。
- 主交付：GitHub Pages 上的互动网页。
- 计数只从云端读取；未连接时显示加载占位和重连提示，不使用浏览器本地假计数。

## 本地预览

1. 安装 Node.js 22 或更新版本。
2. 将 .env.example 复制为 .env.local。
3. 填入 Supabase 项目网址和 anon 或 publishable 公开密钥。
4. 执行 npm install，然后执行 npm run dev。

如果尚无 Supabase 配置，网页仍能打开并显示倒计时；共享计数保持加载状态，按钮不会伪造按下结果。

## 首次部署步骤

1. 在 Supabase 创建项目，在 SQL Editor 中运行 supabase/setup.sql。
2. 在 GitHub 仓库设置的 Actions secrets 中添加 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY。
3. 启用 GitHub Pages 的 Actions 发布来源；推送至 main 会自动发布。

前端公开密钥仅用于 anon 角色，并由行级安全策略和数据库权限限制。绝不能把 service_role 或 sb_secret 密钥放入网页、环境样例或 GitHub。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| index.html | 中文页面结构 |
| src/ | 网页逻辑与视觉样式 |
| supabase/setup.sql | 共享数据表、权限、原子递增函数和 Realtime 设置 |
| .github/workflows/pages.yml | GitHub Pages 构建和发布 |
| docs/PROJECT_CONTEXT.md | 范围与技术约束 |
| docs/HANDOFF.md | 当前状态与后续操作 |
| assets/ | 项目自有视觉素材 |

## 跨设备同步

开始修改前检查 Git 状态；工作树干净时再同步 main。交接前审阅改动和密钥，使用清晰的提交说明并推送到 GitHub。
