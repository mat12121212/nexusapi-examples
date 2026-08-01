import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const mock = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");

  if (request.url === "/public/models") {
    response.end(JSON.stringify([{ id: "kling-v3", name: "Kling v3", kind: "video" }]));
    return;
  }

  if (request.url === "/openapi.json") {
    response.end(JSON.stringify({
      components: {
        schemas: {
          GenerateRequest: {
            properties: {
              params: {
                discriminator: {
                  mapping: { "kling-v3": "#/components/schemas/KlingV3Params" },
                },
              },
            },
          },
          KlingV3Params: {
            type: "object",
            required: ["model_name", "prompt"],
            properties: {
              model_name: { const: "kling-v3" },
              prompt: { type: "string" },
            },
          },
        },
      },
    }));
    return;
  }

  if (request.url === "/generate" && request.method === "POST") {
    if (request.headers.authorization !== "Bearer test-key") {
      response.statusCode = 401;
      response.end(JSON.stringify({ detail: "Unauthorized" }));
      return;
    }
    response.statusCode = 202;
    response.end(JSON.stringify({ task_id: "task-1" }));
    return;
  }

  if (request.url === "/tasks/task-1") {
    response.end(JSON.stringify({ task_id: "task-1", status: "completed", result: { url: "https://example.test/result.mp4" } }));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ detail: "Not found" }));
});

mock.listen(0, "127.0.0.1");
await once(mock, "listening");
const address = mock.address();
if (!address || typeof address === "string") throw new Error("Mock server did not expose a TCP port");

const serverPath = fileURLToPath(new URL("../src/mcp-server.mjs", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: {
    ...process.env,
    NEXUS_API_KEY: "test-key",
    NEXUS_API_BASE_URL: `http://127.0.0.1:${address.port}`,
  },
});
const client = new Client({ name: "nexusapi-smoke-test", version: "1.0.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  const expected = ["nexusapi_generate", "nexusapi_get_model_schema", "nexusapi_get_task", "nexusapi_list_models"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected tool list: ${JSON.stringify(names)}`);
  }

  for (const call of [
    { name: "nexusapi_list_models", arguments: { kind: "video" } },
    { name: "nexusapi_get_model_schema", arguments: { model_name: "kling-v3" } },
    { name: "nexusapi_generate", arguments: { model_name: "kling-v3", prompt: "test" } },
    { name: "nexusapi_get_task", arguments: { task_id: "task-1" } },
  ]) {
    const result = await client.callTool(call);
    if (result.isError) throw new Error(`${call.name} returned an error: ${JSON.stringify(result.content)}`);
  }

  process.stdout.write("MCP smoke test passed: initialize, listTools and four tool calls\n");
} finally {
  await client.close();
  mock.close();
}

