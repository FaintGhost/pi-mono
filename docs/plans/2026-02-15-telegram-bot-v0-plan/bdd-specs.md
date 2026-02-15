# Telegram Bot v0 BDD Specs

## Feature: Telegram 私聊接入 pi RPC（常驻进程）

### Scenario 0: 基础运行骨架可启动
**Given** 已配置 `TELEGRAM_BOT_TOKEN` 与 `TELEGRAM_ALLOWED_USER_IDS`  
**When** 启动 `packages/telegram-bot` 入口进程  
**Then** 进程应完成配置加载并进入 Telegram 监听状态（不崩溃）

### Scenario 1: 白名单私聊可对话且流式更新
**Given** 用户在白名单内且消息来自 `chat.type=private`  
**When** 用户发送普通文本消息  
**Then** Bot 应调用对应 chat 的 pi RPC 会话并以消息编辑方式输出流式回复

### Scenario 2: 非授权或非私聊消息被静默忽略
**Given** 消息来自非白名单用户或来自群聊/频道  
**When** 用户发送消息  
**Then** Bot 不应回复、不应调用 pi RPC、不应创建会话文件

### Scenario 3: 同一 chat 复用常驻进程并串行处理
**Given** 某个 chat 已有活跃 runtime  
**When** 该 chat 连续发送多条消息  
**Then** Bot 应复用同一 runtime，并保证请求按队列串行执行

### Scenario 4: runtime 异常退出后自动恢复
**Given** 某 chat 的 pi RPC 子进程异常退出  
**When** 该 chat 下一条消息到达  
**Then** Bot 应自动重建 runtime 并继续处理请求

### Scenario 5: /reset 执行会话轮转（软重置）
**Given** 当前 chat 已有历史会话  
**When** 用户发送 `/reset`  
**Then** Bot 应保留旧会话文件，切换到新的会话文件并在后续对话中使用新上下文

### Scenario 6: provider/model 继承 pi 默认解析
**Given** 本机已存在 pi 认证与模型默认配置（`auth.json`/env/settings）  
**When** Bot 拉起 pi RPC 子进程  
**Then** 不应强制注入 `--provider/--model`，并应按 pi 默认策略解析模型

### Scenario 7: 空闲 TTL 仅回收进程不删除会话
**Given** 某 chat 在 TTL 时间内无新消息  
**When** 到达空闲回收阈值  
**Then** Bot 应销毁该 chat runtime 但保留会话文件，后续消息可再次拉起并续接会话
