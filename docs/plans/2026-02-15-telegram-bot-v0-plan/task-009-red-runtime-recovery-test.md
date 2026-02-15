# Task 009: [RED] 异常恢复测试

**depends-on**: task-008-green-runtime-reuse-queue-impl

## Description
针对 Scenario 4 编写失败测试，约束 runtime 异常退出后，下一条消息必须触发自动恢复。

## Execution Context
**Task Number**: 009 of 016  
**Phase**: Runtime Reliability  
**Prerequisites**: 已有 runtime 池化能力

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 4: runtime 异常退出后自动恢复

## Files to Modify/Create
- Create: `packages/telegram-bot/test/runtime-recovery.test.ts`

## Steps
### Step 1: Verify Scenario
- 定义“子进程 exit 后下一请求恢复”的单一行为目标。

### Step 2: Implement Test (Red)
- 使用 child_process test double 注入异常退出事件。
- 断言：下一条消息会触发新 runtime 创建并成功进入 prompt 流程。

### Step 3: Verify Red State
- 运行测试并确认失败。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/runtime-recovery.test.ts
```

## Success Criteria
- Scenario 4 用例稳定失败，失败点清晰指向“未自动恢复”。
