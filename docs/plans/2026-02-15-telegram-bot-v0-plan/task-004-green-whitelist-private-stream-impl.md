# Task 004: [GREEN] 白名单私聊流式对话实现

**depends-on**: task-003-red-whitelist-private-stream-test

## Description
实现白名单私聊消息到 pi RPC 的主通路，支持 `text_delta` 驱动的 Telegram 消息编辑。

## Execution Context
**Task Number**: 004 of 016  
**Phase**: Core Features  
**Prerequisites**: Scenario 1 测试处于 Red

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 1: 白名单私聊可对话且流式更新

## Files to Modify/Create
- Modify: `packages/telegram-bot/src/telegram.ts`
- Create: `packages/telegram-bot/src/runtime/rpc-client.ts`
- Create: `packages/telegram-bot/src/runtime/agent-runtime.ts`

## Steps
### Step 1: Implement Logic (Green)
- 接入私聊消息处理到 runtime prompt。
- 订阅 RPC 事件并将 `text_delta` 聚合后节流编辑到 Telegram。
- 在 `agent_end` 做收尾与状态清理。

### Step 2: Verify Green State
- 运行 Scenario 1 测试并确认通过。

### Step 3: Regression Check
- 运行统一检查命令。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/private-streaming.test.ts
cd /root/workspace/pi-mono
npm run check
```

## Success Criteria
- Scenario 1 测试通过。
- 流式输出路径在异常情况下可安全收尾，不遗留挂起状态。
