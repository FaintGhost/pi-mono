# Task 006: [GREEN] 静默忽略规则实现

**depends-on**: task-005-red-silent-ignore-test

## Description
实现私聊白名单守卫与来源过滤逻辑，满足静默忽略策略。

## Execution Context
**Task Number**: 006 of 016  
**Phase**: Core Features  
**Prerequisites**: Scenario 2 测试处于 Red

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 2: 非授权或非私聊消息被静默忽略

## Files to Modify/Create
- Modify: `packages/telegram-bot/src/config.ts`
- Modify: `packages/telegram-bot/src/telegram.ts`

## Steps
### Step 1: Implement Logic (Green)
- 解析并校验白名单用户 ID 配置。
- 在消息入口先执行来源与授权判定，未通过直接返回（静默）。
- 确保被忽略消息不会触发 runtime 或会话路径分配。

### Step 2: Verify Green State
- 运行 Scenario 2 测试并确认通过。

### Step 3: Regression Check
- 运行统一检查命令。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/silent-ignore.test.ts
cd /root/workspace/pi-mono
npm run check
```

## Success Criteria
- Scenario 2 全部通过。
- 静默忽略路径无副作用（无回复、无会话、无 runtime 调用）。
