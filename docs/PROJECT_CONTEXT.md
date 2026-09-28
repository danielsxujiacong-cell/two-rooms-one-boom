# 项目上下文

## 目标

为 10 月 5 日聚会制作手机优先的《两室一弹》中文互动网页。所有访客无需登录，共同维护一个真实的云端按下总数。

## 范围

- V1：倒计时、蓝红双队海报、大按钮、全局原子递增、Realtime 更新、动效、GitHub Pages 部署。
- 明确不做：登录、排行榜、留言、用户资料和 V2 功能。

## 约束与决定

- 倒计时以 Asia/Shanghai 的 2026-10-05 00:00 为游戏开始时刻。
- 首次数据库建立时按需求示例从 12,847 开始；SQL 重复运行不会把已建立的数字重置。
- PostgreSQL bigint 计数通过安全定义的 increment_boom 函数递增，前端不执行读取后加一再写回。
- 表启用 RLS，仅向 anon 提供读取权限；浏览器禁用登录会话持久化。公开配置只接受 anon JWT 或 publishable key。
- 密钥通过本地未跟踪的 .env.local 或 GitHub Actions secrets 注入。仓库中仅保留占位模板。
- Realtime 连接不稳定时，使用 REST 读取与间隔刷新，并显示小型重连提示。
- GitHub Pages 路径为 /two-rooms-one-boom/。

## 验收证据

- node --check src/main.js 与 npm run build 成功；GitHub Pages 工作流构建和发布作业成功。
- 公网页面 HTTP 200，标题为“两室一弹 · 10月5日游戏夜”。
- 本地浏览器在 390×844 和 375×667 视口均无横向溢出；375×667 页面高度为 667 像素；浏览器控制台无错误。
- 未连接 Supabase，因此真实跨浏览器共享、刷新持久性及原子递增尚未测试。
