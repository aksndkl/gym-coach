# 练习册 · 健身教练工作台

面向个人教练的最小版本：邮箱登录、教练/学员角色、学员资料、训练计划和预约。前端使用 React + TypeScript，身份认证与持久化使用托管 Supabase。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

1. 在 Supabase 创建项目。
2. 将 `.env.example` 复制为 `.env`，填入 Supabase Project URL 和公开 anon / publishable key。该公开密钥可用于浏览器，数据库 RLS 是必需的安全边界；**切勿**将 `service_role` / secret key 放入前端。
3. 在 Supabase SQL Editor 执行 `supabase/migrations/202610270001_initial_schema.sql`。
4. 运行 `npm install`，再运行 `npm run dev`。
5. 按 Supabase Auth 的邮件验证提示完成注册和登录。开发环境的站点 URL / redirect URL 应包含本地 Vite 地址。

没有 Supabase 环境变量时，应用显示配置指引，不会伪造登录或本地持久化成功。

## 初始化教练账号

公开注册的账号始终默认为学员，网页端不能修改角色。创建账号并在 Auth 中验证后，由项目所有者在 Supabase SQL Editor 将该账号提升为教练（将 UUID 替换为 Auth Users 中该账号的 ID）：

```sql
update public.profiles
set role = 'coach'
where id = '替换为已验证账号的 UUID';
```

之后教练登录并把工作台显示的关联码分享给学员。学员登录后主动输入该码，数据库只允许学员关联到教练账号；教练可看到已关联学员的资料与记录。

## 数据与隐私边界

- 资料仅保存显示名称及账号邮箱（邮箱由 Supabase Auth 管理）。业务表包括教练-学员关联、训练计划和预约。
- 计划详情用于训练安排；预约备注仅用于时间协调。不要输入诊断、病史、伤病、药物、体测报告或其他敏感健康数据。
- 使用个人/虚构资料进行开发与验证。此原型尚未完成正式上线所需的隐私评估、备份/恢复、审计、数据保留和合规审查。
- 所有业务表均启用 RLS；浏览器角色不可自行提升。可通过 Supabase Auth 关闭公开注册、配置邮件验证及限制允许的站点来源。
- 当前关联流程由学员主动发起，每位学员只能关联一位教练；预约通过确认/取消管理。要解除关联，项目所有者可在 SQL Editor 删除对应的 `public.coach_students` 行。删除关联也会按外键级联删除该关联下的训练计划与预约。

## 检查

```sh
npm run build
```
