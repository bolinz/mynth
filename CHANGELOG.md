# Changelog

## 0.4.2 (2026-06-10)

### Fixed
- **CI**: Remove private submodule checkout from release.yml
- **CI**: Add workflow_dispatch trigger to release.yml
- **Docs**: Fix release flow in AGENTS.md — 禁止直接推送 main，改用 release 分支 + PR

## 0.4.1 (2026-06-10)

### Fixed
- **Build**: Fix 6 TypeScript compilation errors (Operation→BatchOperation rename, missing Task.status, ToolResult.data, etc.)
- **CLI**: Fix private property access to CoreEngine.scheduler
- **CI**: Remove private submodule checkout causing checkout failures
- **CI**: Fix Playwright installation for browser tests
- **CI**: Fix opencode GitHub Action trigger and authentication (use_github_token, timeout, permissions)

## 0.4.0 (2026-06-10)

### Features
- **Agent Tool Use**: Tool interface + ToolRegistry, 4 built-in tools (web search, file, API, code exec), ReActLoop integration
- **Structured Logger**: Typed log levels, structured metadata, TUI/web forwarding
- **MetricsRegistry**: Prometheus-format metrics with counter/gauge/histogram
- **HealthChecker**: Component health probes + aggregate system health endpoint
- **TraceExporter**: Span export with batch processing, configurable exporters
- **Observability wired**: All metrics/health/tracing integrated into CoreEngine + Web UI endpoints

### CI
- opencode GitHub Actions workflow (comment-triggered `/oc` commands)

## 0.3.0 (2026-05-29)

### Features
- **Task tree system**: Mission/Quest/Task/Urgent/SideQuest types with hierarchical decomposition, interrupt/resume, deviation detection, zero-cost progress tracking
- **Interaction protocol**: 7 built-in renderers (markdown, table, cards, diff, flowchart, chart, raw_html), InteractionManager for structured agent↔user dialogs
- **Multi-tenant**: TenantContext prefixes all StateStore keys, full data isolation
- **Distributed tracing**: Tracer with span/parent spans, CLI trace command
- **HITL approval**: Human-in-the-loop with Guard rules, CLI/TUI/Web UI support
- **LLM structured output**: PromptSchema with extractJSON/validateJSON
- **Degradation framework**: Health monitoring for LLM/memory/messaging/agent-pool
- **Resilience**: Deadlock detection, ConfigManager snapshots, backpressure, WAL, graceful shutdown
- **Cold start + L3 backup**: WarmPool→AgentPool, path prediction, PrivateMemory backup/restore
- **Web UI**: Task tree board at /tree with SSE live updates

### Testing
- 379 tests across 65 test files (unit + integration + bench)
- 100% coverage of all 69 logic-bearing source files
- Integration tests: CoreEngine lifecycle, memory consistency, multi-tenant, web server, TUI
- Benchmarks: chain transfer (21ms), message queue (520K msg/s), task scheduling (6ms), vector search (62ms)

### CI
- Matrix build (Node 20 + 22), coverage thresholds (90%+), codecov upload
- Benchmarks run in CI

## 0.2.0 (2026-05-21)

### Features
- LLM integration: Anthropic + OpenAI providers with retry, fallback, circuit-breaking
- ReAct loop (Think-Act-Observe) for agent execution
- BudgetTracker for token cost control
- CoreEngine with full subsystem wiring
- CLI with run/status/list/history/tui/ui commands

## 0.1.0 (2026-05-15)

### Features
- Initial release: chain transfer, meta-layer (Observer + Intervener), agent pool
- EventBus with 8 topics, MemoryQueue point-to-point
- LevelDB persistence, StateStore
- Virtual SubAgents with parallel execution
- Basic CLI and TUI
