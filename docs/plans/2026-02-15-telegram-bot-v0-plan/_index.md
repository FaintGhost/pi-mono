# Telegram Bot v0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: 使用 Skill tool 加载 `superpowers:executing-plans` 执行本计划。

**Goal:** 交付一个仅支持私聊的 Telegram Bot，复用 pi 的 provider/model 配置，通过 `pi --mode rpc` 提供与当前会话同等级能力，并采用每 chat 常驻 runtime。

**Architecture:** 采用“Telegram 适配层 + chat 级 runtime 池 + pi RPC 客户端”三层结构。每个 `chat_id` 绑定一个常驻子进程和串行队列，确保上下文隔离与并发安全。`/reset` 通过会话轮转实现软重置，旧会话永久保留。

**Tech Stack:** TypeScript, Node.js, Telegraf（或等价 Telegram SDK）, `@mariozechner/pi-coding-agent` RPC 协议, Vitest。

**Design Support:**
- [BDD Specs](./bdd-specs.md)

## Execution Plan
- [Task 001: [RED] 基础启动骨架测试](./task-001-red-bootstrap-startup-test.md)
- [Task 002: [GREEN] 基础入口与配置加载实现](./task-002-green-bootstrap-startup-impl.md)
- [Task 003: [RED] 白名单私聊流式对话测试](./task-003-red-whitelist-private-stream-test.md)
- [Task 004: [GREEN] 白名单私聊流式对话实现](./task-004-green-whitelist-private-stream-impl.md)
- [Task 005: [RED] 静默忽略规则测试](./task-005-red-silent-ignore-test.md)
- [Task 006: [GREEN] 静默忽略规则实现](./task-006-green-silent-ignore-impl.md)
- [Task 007: [RED] 常驻复用与串行队列测试](./task-007-red-runtime-reuse-queue-test.md)
- [Task 008: [GREEN] 常驻复用与串行队列实现](./task-008-green-runtime-reuse-queue-impl.md)
- [Task 009: [RED] 异常恢复测试](./task-009-red-runtime-recovery-test.md)
- [Task 010: [GREEN] 异常恢复实现](./task-010-green-runtime-recovery-impl.md)
- [Task 011: [RED] /reset 会话轮转测试](./task-011-red-reset-rotation-test.md)
- [Task 012: [GREEN] /reset 会话轮转实现](./task-012-green-reset-rotation-impl.md)
- [Task 013: [RED] provider/model 默认继承测试](./task-013-red-provider-default-resolution-test.md)
- [Task 014: [GREEN] provider/model 默认继承实现](./task-014-green-provider-default-resolution-impl.md)
- [Task 015: [RED] 空闲 TTL 回收测试](./task-015-red-idle-ttl-recycle-test.md)
- [Task 016: [GREEN] 空闲 TTL 回收实现](./task-016-green-idle-ttl-recycle-impl.md)

---

## Execution Handoff
Plan 已保存到 `docs/plans/2026-02-15-telegram-bot-v0-plan/`。

执行选项：
1. 推荐：使用 `superpowers:executing-plans` 按任务编排执行  
2. 并行工程化：使用 `superpowers:agent-team-driven-development`  
3. 场景驱动：使用 `superpowers:behavior-driven-development` 针对单场景推进
