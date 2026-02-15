# Task 003: [RED] 白名单私聊流式对话测试

**depends-on**: task-002-green-bootstrap-startup-impl

## Description
针对 Scenario 1 编写失败测试，约束白名单私聊消息必须触发 pi RPC prompt，并通过消息编辑实现流式输出。

## Execution Context
**Task Number**: 003 of 016  
**Phase**: Core Features  
**Prerequisites**: 基础入口可启动

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 1: 白名单私聊可对话且流式更新

## Files to Modify/Create
- Create: `packages/telegram-bot/test/private-streaming.test.ts`
- Create: `packages/telegram-bot/test/doubles/fake-rpc-runtime.ts`

## Steps
### Step 1: Verify Scenario
- 将测试用例命名为 Scenario 1 对应语义。

### Step 2: Implement Test (Red)
- 构造白名单私聊消息输入。
- 使用 test doubles 隔离 Telegram API 与 RPC 子进程，模拟 `text_delta` 与 `agent_end` 事件。
- 断言：先发送占位消息，再连续编辑消息，最终收敛到完整回复。

### Step 3: Verify Red State
- 运行测试并确认失败。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/private-streaming.test.ts
```

## Success Criteria
- 测试稳定失败且指向“未实现私聊流式桥接行为”。
