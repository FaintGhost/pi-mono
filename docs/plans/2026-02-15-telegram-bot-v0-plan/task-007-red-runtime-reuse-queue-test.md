# Task 007: [RED] 常驻复用与串行队列测试

**depends-on**: task-004-green-whitelist-private-stream-impl

## Description
针对 Scenario 3 编写失败测试，约束同一 chat 必须复用 runtime 且请求串行执行。

## Execution Context
**Task Number**: 007 of 016  
**Phase**: Runtime  
**Prerequisites**: 私聊主通路可运行

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 3: 同一 chat 复用常驻进程并串行处理

## Files to Modify/Create
- Create: `packages/telegram-bot/test/runtime-reuse-queue.test.ts`

## Steps
### Step 1: Verify Scenario
- 设计“同一 chat 两次请求”与“并发输入排队”两个断言点。

### Step 2: Implement Test (Red)
- 用 runtime/pool doubles 记录进程创建次数和执行顺序。
- 断言：创建次数为 1；第二条消息在第一条完成后才开始处理。

### Step 3: Verify Red State
- 运行测试并确认失败。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/runtime-reuse-queue.test.ts
```

## Success Criteria
- Scenario 3 用例稳定失败并准确反映“复用/串行”缺失。
