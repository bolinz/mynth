# LLM 结构化输出设计

> 为 mynth 添加 Zod schema 驱动的 LLM 结构化输出系统，支持按 capability 注册 output schema，自动校验 LLM 响应。

## 设计目标

- 按 capability 注册 Zod schema，LLM 响应自动校验
- strict/loose 模式可配置
- 向后兼容——不破坏现有 ReActLoop 和文本 prompt 路径
- 与 PromptRegistry 集成，构建带 JSON 格式说明的 prompt

## 数据模型

```typescript
interface PromptSchema<T> {
  name: string;                 // schema 标识名
  schema: z.ZodType<T>;        // Zod schema
  strict: boolean;              // true=校验失败抛异常, false=降级返回原始文本
  extractInstructions: string;  // 追加到 prompt 末尾的 JSON 格式说明
}
```

## 组件设计

### PromptSchema 工具函数

`packages/core/src/prompt/PromptSchema.ts`

```typescript
function extractJSON(text: string): string;
```

功能：从 LLM 回复中提取 JSON 字符串：
1. 尝试 `parse` 整个文本
2. 匹配 ` ```json...``` ` 代码块
3. 匹配 `{...}` 或 `[...]` 第一个外围结构
4. 以上均失败则返回空字符串

### PromptRegistry 扩展

- `registerSchema(capability, promptSchema)` — 注册
- `getSchema(capability)` — 按 capability 查 schema，返回 `PromptSchema | undefined`
- `buildStructuredPrompt(capability, task, context)` — 在原 prompt 末尾追加 `extractInstructions`

### ChainTransferManager 集成

在 `executeWithLLM()` 中，LLM 调用后添加步骤：

```
result = await loop.execute(prompt, capability)
schema = promptRegistry.getSchema(capability)
if schema:
  json = extractJSON(result)
  try:
    parsed = schema.schema.parse(JSON.parse(json))
    result = JSON.stringify(parsed)  // 格式化后写回
  catch err:
    if strict:
      throw ValidationError
    else:
      bus.publish('anomaly.detected', { type: 'structured_output_validation_failed' })
      // 返回原始 result，不做处理
return result
```

## 文件清单

| 操作 | 文件 |
|------|------|
| Create | `packages/core/src/prompt/PromptSchema.ts` |
| Create | `packages/core/test/prompt/PromptSchema.test.ts` |
| Modify | `packages/core/src/prompt/PromptRegistry.ts` |
| Modify | `packages/core/src/chain/ChainTransferManager.ts` |
| Modify | `packages/core/src/index.ts` |

## 实施顺序

1. `PromptSchema.ts` — extractJSON + 类型定义 + 测试
2. PromptRegistry 扩展 — registerSchema + getSchema + buildStructuredPrompt
3. ChainTransferManager 集成 — 自动校验
4. 导出 + 示例 schema 注册
