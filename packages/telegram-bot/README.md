# @mariozechner/pi-telegram-bot

Telegram 机器人（私聊 + 超级群 Topic），基于 `pi --mode rpc`，复用本机 pi 的认证与模型默认解析。

## 特性（v0）

-  同时支持私聊与超级群 Topic
-  白名单控制（非白名单静默忽略）
-  超级群采用 `1 Topic = 1 Session`
-  每个会话上下文常驻一个 pi RPC runtime
-  原生输入中状态（`sendChatAction: typing`）
-  默认非流式：仅 typing，完成后一次性回复
-  `/reset` 软重置（会话轮转，旧会话文件保留）
-  `/session` 会话管理（查看、列出、创建、切换、删除）
-  `/details` 查看最近一次“完整回答 + 关键工具摘要”
-  429 限流自动重试（提示“受限重试中”，成功后更新最终答案）
-  超级群主聊天区（无 Topic）静默忽略
-  启动时注册私聊命令；超级群对白名单成员懒注册命令
-  空闲 TTL 回收 runtime（不删除会话文件）
-  控制台结构化日志（启动、消息、错误、reset）

## 运行前提

1.  已安装并可执行 `pi`（或通过 `PI_BIN` 指定路径）
2.  已配置 pi 认证（例如 `~/.pi/agent/auth.json` 或相关环境变量）

## 环境变量

-  `TELEGRAM_BOT_TOKEN`（必填）
-  `TELEGRAM_ALLOWED_USER_IDS`（必填，逗号分隔，例如 `12345,67890`）
-  `PI_BIN`（可选，默认 `pi`）
-  `PI_CWD`（可选，默认当前目录）
-  `TELEGRAM_DATA_DIR`（可选，默认 `./data/telegram-bot`）
-  `TELEGRAM_IDLE_TTL_MS`（可选，默认 `1200000`）
-  `TELEGRAM_STREAM_EDIT_THROTTLE_MS`（可选，默认 `600`，当前默认非流式回复可忽略）
-  `TELEGRAM_PARSE_MODE`（可选，默认 `Markdown`，可选：`none` / `Markdown` / `MarkdownV2` / `HTML`）
-  `TELEGRAM_ENV_FILE`（可选，默认 `.env`，相对当前工作目录）

### .env 自动加载

启动时会自动读取当前工作目录下的 `.env`。若设置了 `TELEGRAM_ENV_FILE`，则读取该路径。

示例：

```env
TELEGRAM_BOT_TOKEN=123456:ABCDEF
TELEGRAM_ALLOWED_USER_IDS=123456789
PI_CWD=/root/workspace/pi-mono
TELEGRAM_PARSE_MODE=Markdown
```

也可以直接复制模板：

```bash
cp .env.example .env
```

优先级：**系统环境变量 > .env 文件**。

## 命令注册

-  启动时会注册私聊命令（scope=`all_private_chats`）
-  超级群中，白名单成员首次发言时，按成员维度懒注册命令（scope=`chat_member`）

当前命令：

-  `/reset`
-  `/session`
-  `/details`

### 私聊 `/session` 子命令

-  `/session` 或 `/session current`：查看当前会话
-  `/session list`：列出当前 chat 的所有会话
-  `/session new`：创建并切换到新会话
-  `/session use <编号|文件名>`：切换到指定历史会话
-  `/session delete <编号|文件名>`：删除指定会话（若删除当前会话，会自动切换到可用会话）
-  `/details`：查看最近一次完整回答与关键工具调用摘要

### 超级群 Topic `/session` 子命令

-  `/session`：查看当前 Topic 会话
-  `/session list`：列出本群所有 Topic 会话
-  `/session new`：创建新 Topic + 新会话（返回可点击深链）
-  `/session use`：禁用（请直接切换 Topic）
-  `/session delete`：删除当前 Topic 与其会话（删 Topic 失败会回滚，不删除会话）
-  `/details`：仅查看当前 Topic 最近一次完整回答与关键工具摘要

## 会话目录

默认会话目录：`./data/telegram-bot/sessions/<context_id>/`

-  私聊 context：`<chat_id>`
-  超级群 Topic context：`supergroup-<chat_id>-topic-<message_thread_id>`
-  `active-session.txt`：当前活跃会话指针
-  `session-*.jsonl`：历史会话文件（永久保留）
-  `latest-response.json`：最近一次回答详情（供 `/details` 使用，重启后仍可读取）

## 启动

```bash
cd packages/telegram-bot
npm run build
node dist/main.js
```
