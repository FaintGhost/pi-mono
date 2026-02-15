# Task 005: [RED] 静默忽略规则测试

**depends-on**: task-002-green-bootstrap-startup-impl

## Description
针对 Scenario 2 编写失败测试，约束“非白名单私聊”与“非私聊来源”必须静默忽略。

## Execution Context
**Task Number**: 005 of 016  
**Phase**: Core Features  
**Prerequisites**: 基础入口可启动

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 2: 非授权或非私聊消息被静默忽略

## Files to Modify/Create
- Create: `packages/telegram-bot/test/silent-ignore.test.ts`

## Steps
### Step 1: Verify Scenario
- 为“非白名单私聊”和“群聊/频道消息”分别建用例。

### Step 2: Implement Test (Red)
- 使用 Telegram 与 runtime test doubles。
- 断言：不发送回复、不触发 runtime、不创建会话路径。
- 失败必须是行为断言失败。

### Step 3: Verify Red State
- 运行测试并确认失败。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/silent-ignore.test.ts
```

## Success Criteria
- Scenario 2 用例稳定失败，定位到忽略策略未实现。
