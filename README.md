# todo

A password-protected personal planner for monthly goals and daily/weekly todos, with a browsable completion history and an MCP server so AI agents can manage the board.

```mermaid
flowchart LR
  subgraph browser["Browser"]
    client["apps/client<br/>React 19 · Vite · TanStack Query"]
  end

  agent["AI agent"] -- "MCP (stdio / HTTP)" --> mcp["apps/mcp<br/>MCP server"]

  subgraph vercel["Vercel"]
    static["client/dist"]
  end

  subgraph railway["Railway"]
    server["apps/server<br/>Fastify 5 · Prisma"]
  end

  static -- "serves SPA" --> client
  client -- "/api (session cookie, rewritten by Vercel)" --> server
  mcp -- "/api (password login)" --> server
  server --> db[("PostgreSQL 16")]

  shared["packages/shared<br/>Zod schemas & types"] -.-> client
  shared -.-> server
  shared -.-> mcp
```
