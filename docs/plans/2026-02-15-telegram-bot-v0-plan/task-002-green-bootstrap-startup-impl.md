# Task 002: [GREEN] 基础入口与配置加载实现

**depends-on**: task-001-red-bootstrap-startup-test

## Description
实现最小可运行包骨架（入口、配置、Telegram 适配初始化），使 Scenario 0 的失败测试转绿。

## Execution Context
**Task Number**: 002 of 016  
**Phase**: Foundation  
**Prerequisites**: Task 001 已完成且失败原因为行为未实现

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 0: 基础运行骨架可启动

## Files to Modify/Create
- Create: `packages/telegram-bot/package.json`
- Create: `packages/telegram-bot/tsconfig.json`
- Create: `packages/telegram-bot/src/main.ts`
- Create: `packages/telegram-bot/src/config.ts`
- Create: `packages/telegram-bot/src/telegram.ts`

## Steps
### Step 1: Implement Logic (Green)
- 创建 v0 运行入口和配置读取模块。
- 提供可注入的 Telegram 客户端构造路径，便于测试替身接管。
- 保证启动流程满足 Task 001 的断言。

### Step 2: Verify Green State
- 运行 Scenario 0 测试并确认通过。

### Step 3: Regression Check
- 运行仓库统一检查命令，确认无类型/格式回归。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/bootstrap.startup.test.ts
cd /root/workspace/pi-mono
npm run check
```

## Success Criteria
- Task 001 对应测试转绿。
- 启动骨架可运行，后续任务可在该基础上扩展。
