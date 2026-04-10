---
name: New Tool
about: Propose or contribute a new tool
title: "[Tool] "
labels: enhancement
---

## Tool Name
`tool_name`

## Pack
Which pack does this belong to? (google / vault / browser / admin / new pack)

## Description
What does this tool do? One sentence.

## Input Schema
```typescript
{
  param1: z.string().describe("..."),
  param2: z.number().optional().describe("..."),
}
```

## API / Service
What external API or service does this tool use?

## Required Env Vars
Any new environment variables needed?

## Example Usage
```
tool_name({ param1: "value" })
// → Expected output
```
