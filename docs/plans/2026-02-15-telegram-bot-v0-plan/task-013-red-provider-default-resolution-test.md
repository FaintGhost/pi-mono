# Task 013: [RED] provider/model 默认继承测试

**depends-on**: task-002-green-bootstrap-startup-impl

## Description
针对 Scenario 6 编写失败测试，约束 Bot 拉起 pi RPC 时不得强制注入 `--provider/--model`。

## Execution Context
**Task Number**: 013 of 016  
**Phase**: Integration  
**Prerequisites**: 基础启动骨架已存在

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 6: provider/model 继承 pi 默认解析

## Files to Modify/Create
- Create: `packages/telegram-bot/test/provider-default-resolution.test.ts`

## Steps
### Step 1: Verify Scenario
- 明确断言目标：spawn 参数不出现强制 provider/model。

### Step 2: Implement Test (Red)
- 使用 child_process test double 捕获 pi 启动参数。
- 断言：保留 `--mode rpc` 与会话参数；不注入 `--provider`、`--model`。
- 断言：认证来源依赖宿主环境与 pi 默认机制。

### Step 3: Verify Red State
- 运行测试并确认失败。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/provider-default-resolution.test.ts
```

## Success Criteria
- Scenario 6 用例稳定失败且可明确定位。
