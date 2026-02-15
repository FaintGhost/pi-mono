# Task 012: [GREEN] /reset 会话轮转实现

**depends-on**: task-011-red-reset-rotation-test

## Description
实现 `/reset` 命令的软重置：会话轮转、新 runtime 切换、旧会话保留。

## Execution Context
**Task Number**: 012 of 016  
**Phase**: Session Management  
**Prerequisites**: Scenario 5 测试处于 Red

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 5: /reset 执行会话轮转（软重置）

## Files to Modify/Create
- Create: `packages/telegram-bot/src/storage/session-path.ts`
- Modify: `packages/telegram-bot/src/telegram.ts`
- Modify: `packages/telegram-bot/src/runtime/agent-pool.ts`

## Steps
### Step 1: Implement Logic (Green)
- 定义会话路径命名与轮转策略（旧文件保留，新文件激活）。
- 将 `/reset` 路由到“重建 runtime + 切换新会话路径”。
- 保证仅影响当前 chat。

### Step 2: Verify Green State
- 运行 Scenario 5 测试并确认通过。

### Step 3: Regression Check
- 运行统一检查命令。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/reset-rotation.test.ts
cd /root/workspace/pi-mono
npm run check
```

## Success Criteria
- Scenario 5 测试通过。
- `/reset` 不删除历史文件，且后续消息使用新会话。
