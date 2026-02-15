# Task 008: [GREEN] 常驻复用与串行队列实现

**depends-on**: task-007-red-runtime-reuse-queue-test

## Description
实现 `chat_id -> AgentRuntime` 池化与 chat 级串行队列，满足常驻复用和并发安全。

## Execution Context
**Task Number**: 008 of 016  
**Phase**: Runtime  
**Prerequisites**: Scenario 3 测试处于 Red

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 3: 同一 chat 复用常驻进程并串行处理

## Files to Modify/Create
- Create: `packages/telegram-bot/src/runtime/agent-pool.ts`
- Create: `packages/telegram-bot/src/runtime/queue.ts`
- Modify: `packages/telegram-bot/src/telegram.ts`

## Steps
### Step 1: Implement Logic (Green)
- 在池中维护 runtime 生命周期与 chat 级队列。
- 对同 chat 重复请求复用同一 runtime 实例。
- 确保同 chat 请求按先进先出顺序执行。

### Step 2: Verify Green State
- 运行 Scenario 3 测试并确认通过。

### Step 3: Regression Check
- 运行统一检查命令。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/runtime-reuse-queue.test.ts
cd /root/workspace/pi-mono
npm run check
```

## Success Criteria
- Scenario 3 测试通过。
- runtime 复用与串行队列行为稳定、无竞态。
