# Task 016: [GREEN] 空闲 TTL 回收实现

**depends-on**: task-015-red-idle-ttl-recycle-test

## Description
实现 chat 级空闲 TTL 管理：到期回收 runtime，保留会话文件并支持后续惰性拉起。

## Execution Context
**Task Number**: 016 of 016  
**Phase**: Runtime Lifecycle  
**Prerequisites**: Scenario 7 测试处于 Red

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 7: 空闲 TTL 仅回收进程不删除会话

## Files to Modify/Create
- Modify: `packages/telegram-bot/src/runtime/agent-pool.ts`
- Modify: `packages/telegram-bot/src/config.ts`
- Modify: `packages/telegram-bot/README.md`

## Steps
### Step 1: Implement Logic (Green)
- 在 runtime 池中加入空闲计时与到期回收机制。
- 明确回收仅作用于进程实例，不触碰会话文件。
- 在下一次消息到来时自动重建 runtime 并复用既有会话路径。

### Step 2: Verify Green State
- 运行 Scenario 7 测试并确认通过。

### Step 3: Final Regression Check
- 运行统一检查命令。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/idle-ttl-recycle.test.ts
cd /root/workspace/pi-mono
npm run check
```

## Success Criteria
- Scenario 7 测试通过。
- TTL 回收后行为符合“进程可回收、会话永久保留”的约束。
