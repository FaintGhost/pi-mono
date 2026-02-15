# Task 011: [RED] /reset 会话轮转测试

**depends-on**: task-008-green-runtime-reuse-queue-impl

## Description
针对 Scenario 5 编写失败测试，约束 `/reset` 必须执行会话轮转（旧文件保留，新会话生效）。

## Execution Context
**Task Number**: 011 of 016  
**Phase**: Session Management  
**Prerequisites**: runtime 池化与消息路由已可用

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 5: /reset 执行会话轮转（软重置）

## Files to Modify/Create
- Create: `packages/telegram-bot/test/reset-rotation.test.ts`

## Steps
### Step 1: Verify Scenario
- 覆盖 `/reset` 后“旧会话保留 + 新会话启用”两个断言。

### Step 2: Implement Test (Red)
- 使用文件系统与 runtime test doubles，避免真实子进程/网络调用。
- 断言：执行 `/reset` 后会生成新会话路径并重建 runtime。
- 断言：旧会话文件仍存在。

### Step 3: Verify Red State
- 运行测试并确认失败。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/reset-rotation.test.ts
```

## Success Criteria
- Scenario 5 用例稳定失败且失败原因明确。
