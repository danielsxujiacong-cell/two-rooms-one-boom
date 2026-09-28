# 当前交接

## 状态

- 更新时间：2026-09-28
- 状态：V1 网页已部署并通过公网访问；等待 Supabase 云端配置和实际多人验收。
- 已完成：中文海报与动画、Asia/Shanghai 倒计时、Supabase SQL、安全公开密钥校验、GitHub Pages 工作流。
- 公网网址：https://danielsxujiacong-cell.github.io/two-rooms-one-boom/
- GitHub：仓库 two-rooms-one-boom，main 已推送。

## 后续操作

1. 在 Supabase 新建独立的 two-rooms-one-boom 项目，用户本人设置数据库密码后运行 supabase/setup.sql。当前账号里唯一现有项目属于 Pomodoro，不应复用。
2. 将 Supabase Project URL 与 anon 或 publishable key 添加到 GitHub Actions secrets：VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY。
3. 确认仓库 Pages 发布来源设为 GitHub Actions；推送 main 后等待发布完成。
4. 通过两个独立浏览器进行按下递增、刷新持久性和实时同步验收，并用手机访问公开页面。

## 风险边界

- Supabase 项目、数据连接和线上计数在其配置完成之前均未验证。
- 当前账号中唯一现有项目属于 Pomodoro；请为本项目创建独立 Supabase 项目并由你本人设置数据库密码。
- 未配置云端公开值时，网页会显示加载占位和“正在重新连接……”，不会展示本地或示例数字。
- 页面部署与数据库配置彼此独立；公开网页可在 Supabase 配置完成前先行发布。
