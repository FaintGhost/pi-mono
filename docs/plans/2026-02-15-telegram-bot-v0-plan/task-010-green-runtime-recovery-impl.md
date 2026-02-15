# Task 010: [GREEN] 异常恢复实现

**depends-on**: task-009-red-runtime-recovery-test

## Description
实现 runtime 异常退出感知与惰性重建策略，确保后续请求可自动恢复。

## Execution Context
**Task Number**: 010 of 016  
**Phase**: Runtime Reliability  
**Prerequisites**: Scenario 4 测试处于 Red

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 4: runtime 异常退出后自动恢复

## Files to Modify/Create
- Modify: `packages/telegram-bot/src/runtime/agent-runtime.ts`
- Modify: `packages/telegram-bot/src/runtime/agent-pool.ts`

## Steps
### Step 1: Implement Logic (Green)
- 在 runtime/pool 中记录“进程可用性状态”。
- 对异常退出实例进行失效标记，并在下一次请求时自动重建。
- 补充错误日志上下文（chat_id、request_id）。

### Step 2: Verify Green State
- 运行 Scenario 4 测试并确认通过。

### Step 3: Regression Check
- 运行统一检查命令。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/runtime-recovery.test.ts
cd /root/workspace/pi-mono
npm run check
```

## Success Criteria
- Scenario 4 测试通过。
- 异常恢复路径可重复触发且无僵尸 runtime 残留。
