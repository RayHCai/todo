import { createServer as createHttpServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createApiClient } from "./api";
import { createServer } from "./server";

// In stdio mode stdout carries the MCP protocol, so all diagnostics go to stderr.
const password = process.env.TODO_PASSWORD;
if (!password) {
  console.error("TODO_PASSWORD is required: set it to the backend's APP_PASSWORD.");
  process.exit(1);
}
const baseUrl = process.env.TODO_API_URL ?? "http://127.0.0.1:3000";
const api = createApiClient({ baseUrl, password });

if (process.env.MCP_TRANSPORT === "http") {
  await serveHttp();
} else {
  await createServer(api).connect(new StdioServerTransport());
  console.error(`todo MCP server ready (backend: ${baseUrl})`);
}

/**
 * Serves MCP over Streamable HTTP at `/mcp/<MCP_SECRET>`, for remote clients such as claude.ai
 * custom connectors. Those can't send custom auth headers, so the secret path is the credential.
 * Stateless: every request gets a fresh server and transport; the API client (and its session
 * cookie) is shared.
 */
async function serveHttp(): Promise<void> {
  const secret = process.env.MCP_SECRET;
  if (!secret || secret.length < 32) {
    console.error("MCP_SECRET is required in http mode and must be at least 32 characters.");
    process.exit(1);
  }
  const expected = Buffer.from(`/mcp/${secret}`);
  const port = Number(process.env.PORT ?? 3001);

  const http = createHttpServer(async (req, res) => {
    const path = Buffer.from((req.url ?? "").split("?")[0]!);
    if (path.toString() === "/health") {
      res.writeHead(200).end("ok");
      return;
    }
    if (path.length !== expected.length || !timingSafeEqual(path, expected)) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      // Stateless mode has no server-initiated stream or session to delete.
      res.writeHead(405, { allow: "POST" }).end();
      return;
    }
    const server = createServer(api);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("MCP request failed:", err);
      if (!res.headersSent) res.writeHead(500).end();
    }
  });

  http.listen(port, "0.0.0.0", () => {
    console.error(`todo MCP server listening on :${port} (backend: ${baseUrl})`);
  });
}
