# Task 001: [RED] 基础启动骨架测试

**depends-on**: (none)

## Description
针对 Scenario 0 编写失败测试，约束 v0 启动入口必须完成配置加载并进入 Telegram 监听流程。

## Execution Context
**Task Number**: 001 of 016  
**Phase**: Foundation  
**Prerequisites**: 无

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 0: 基础运行骨架可启动

## Files to Modify/Create
- Create: `packages/telegram-bot/test/bootstrap.startup.test.ts`
- Create: `packages/telegram-bot/test/doubles/fake-telegram-client.ts`

## Steps
### Step 1: Verify Scenario
- 确认测试名称与 Scenario 0 一一对应。

### Step 2: Implement Test (Red)
- 编写入口启动行为测试：验证合法配置下会调用“启动监听”流程。
- 使用 test doubles 隔离外部依赖：Telegram SDK、环境变量读取、进程信号。
- 失败必须是断言失败（行为未实现），不能是 import/config 崩溃。

### Step 3: Verify Red State
- 运行单测并确认失败。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/bootstrap.startup.test.ts
```

## Success Criteria
- 测试文件可运行且稳定失败（Red）。
- 失败原因体现“尚未实现启动监听行为”。
