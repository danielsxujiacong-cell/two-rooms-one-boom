# 项目说明

- 网页为纯中文单页，使用 Vite 构建并部署到 GitHub Pages。
- 共享计数只通过 `public.two_rooms_boom_counter` 读取、通过 `increment_two_rooms_boom` 数据库函数原子递增。严禁以 localStorage、静态数据或前端读改写模拟全局数值。
- 浏览器只可使用 Supabase anon 或 publishable 公开密钥；service_role 和 sb_secret 密钥不能进入网页、仓库或构建变量。
- Supabase 修改以 supabase/setup.sql 为准；只改两室一弹专属表，表仅向 anon 开放读取，递增仅由安全定义函数授权，不改同项目内其他表或函数。
- 保持手机一屏布局、中文界面、键盘可操作性和减少动态效果设置。
- 仓库固定为 GitHub Pages 项目路径；发布前确认 Vite base 和页面资源路径。

## 常用命令

- npm run dev：本地预览。
- npm run build：构建 Pages 静态文件。
- npm run preview：预览构建结果。

## Git 发布

- 提交前审阅暂存文件，确认 .env、令牌、私钥和机器配置均未加入。
- 默认在 main 上使用普通提交和推送；不改写共享历史。
