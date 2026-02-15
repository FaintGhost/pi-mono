# Task 014: [GREEN] provider/model 默认继承实现

**depends-on**: task-013-red-provider-default-resolution-test

## Description
实现 pi 子进程启动参数策略，确保 provider/model 解析完全复用 pi 现有默认机制。

## Execution Context
**Task Number**: 014 of 016  
**Phase**: Integration  
**Prerequisites**: Scenario 6 测试处于 Red

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 6: provider/model 继承 pi 默认解析

## Files to Modify/Create
- Modify: `packages/telegram-bot/src/runtime/agent-runtime.ts`
- Modify: `packages/telegram-bot/src/config.ts`
- Create: `packages/telegram-bot/README.md`

## Steps
### Step 1: Implement Logic (Green)
- 固化 spawn 参数最小集合（`--mode rpc`、session、cwd 等）。
- 禁止在代码中硬编码 provider/model。
- 在 README 说明如何复用 `~/.pi/agent/auth.json` 与环境变量。

### Step 2: Verify Green State
- 运行 Scenario 6 测试并确认通过。

### Step 3: Regression Check
- 运行统一检查命令。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/provider-default-resolution.test.ts
cd /root/workspace/pi-mono
npm run check
```

## Success Criteria
- Scenario 6 测试通过。
- Bot 行为与本地 pi 默认模型解析一致。
