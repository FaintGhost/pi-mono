# @mariozechner/pi-telegram-bot

Telegram 私聊机器人，基于 `pi --mode rpc`，复用本机 pi 的认证与模型默认解析。

## 特性（v0）

-  仅处理私聊消息（`chat.type=private`）
-  白名单控制（非白名单静默忽略）
-  每个 chat 常驻一个 pi RPC runtime
-  原生输入中状态（`sendChatAction: typing`）
-  流式回复（通过 Telegram 消息编辑）
-  `/reset` 软重置（会话轮转，旧会话文件保留）
-  `/session` 会话管理（查看、列出、创建、切换）
-  启动时自动注册 Telegram 命令（根据实现能力自动更新）
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
-  `TELEGRAM_STREAM_EDIT_THROTTLE_MS`（可选，默认 `600`）
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

Bot 启动时会根据当前实现能力自动调用 Telegram `setMyCommands`（scope 为私聊）注册命令列表。

当前会注册：

-  `/reset` - 重置当前会话
-  `/session` - 会话管理（查看、列出、创建、切换、删除）

`/session` 子命令：

-  `/session` 或 `/session current`：查看当前会话
-  `/session list`：列出当前 chat 的所有会话
-  `/session new`：创建并切换到新会话
-  `/session use <编号|文件名>`：切换到指定历史会话
-  `/session delete <编号|文件名>`：删除指定会话（若删除当前会话，会自动切换到可用会话）

## 会话目录

默认会话目录：`./data/telegram-bot/sessions/<chat_id>/`

-  `active-session.txt`：当前活跃会话指针
-  `session-*.jsonl`：历史会话文件（永久保留）

## 启动

```bash
cd packages/telegram-bot
npm run build
node dist/main.js
```
