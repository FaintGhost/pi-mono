# Task 015: [RED] 空闲 TTL 回收测试

**depends-on**: task-008-green-runtime-reuse-queue-impl

## Description
针对 Scenario 7 编写失败测试，约束空闲超时仅回收 runtime，不删除会话文件。

## Execution Context
**Task Number**: 015 of 016  
**Phase**: Runtime Lifecycle  
**Prerequisites**: runtime 池化已可用

## BDD Scenario Reference
**Spec**: `./bdd-specs.md`  
**Scenario**: Scenario 7: 空闲 TTL 仅回收进程不删除会话

## Files to Modify/Create
- Create: `packages/telegram-bot/test/idle-ttl-recycle.test.ts`

## Steps
### Step 1: Verify Scenario
- 定义“超时回收”和“后续恢复续接”两个断言。

### Step 2: Implement Test (Red)
- 使用 fake timers 和文件系统 test doubles，隔离真实时间与磁盘副作用。
- 断言：超时后 runtime 被释放。
- 断言：会话文件仍存在，后续消息可重新拉起 runtime。

### Step 3: Verify Red State
- 运行测试并确认失败。

## Verification Commands
```bash
cd packages/telegram-bot
npx tsx ../../node_modules/vitest/dist/cli.js --run test/idle-ttl-recycle.test.ts
```

## Success Criteria
- Scenario 7 用例稳定失败且指向 TTL 回收逻辑缺失。
