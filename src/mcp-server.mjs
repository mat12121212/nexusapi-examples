#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const apiBaseUrl = (process.env.NEXUS_API_BASE_URL || "https://nexusapi.dev").replace(/\/$/, "");
const apiKey = process.env.NEXUS_API_KEY || "";

function textResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function errorResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

async function request(path, { authenticated = false, ...options } = {}) {
  if (authenticated && !apiKey) {
    throw new Error("NEXUS_API_KEY is required for this tool");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(authenticated ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...options.headers,
    },
  });

  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }

  if (!response.ok) {
    const details = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`NexusAPI returned HTTP ${response.status}: ${details.slice(0, 1500)}`);
  }
  return body;
}

const server = new McpServer({
  name: "nexusapi-mcp",
  version: "1.0.0",
});

server.registerTool(
  "nexusapi_list_models",
  {
    title: "List NexusAPI models",
    description: "List the models currently exposed by the public NexusAPI catalog, optionally filtered by kind or search text.",
    inputSchema: z.object({
      kind: z.enum(["video", "image"]).optional().describe("Optional output kind filter"),
      query: z.string().trim().min(1).optional().describe("Optional case-insensitive search in model id and name"),
    }),
  },
  async ({ kind, query }) => {
    try {
      const models = await request("/public/models");
      if (!Array.isArray(models)) throw new Error("The public model catalog did not return an array");
      const needle = query?.toLocaleLowerCase();
      const filtered = models.filter((model) => {
        if (kind && model.kind !== kind) return false;
        if (!needle) return true;
        return `${model.id || ""} ${model.name || ""}`.toLocaleLowerCase().includes(needle);
      });
      return textResult({ count: filtered.length, models: filtered });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "nexusapi_get_model_schema",
  {
    title: "Get a NexusAPI model schema",
    description: "Read the live OpenAPI parameter schema for one NexusAPI model id before constructing a generation request.",
    inputSchema: z.object({
      model_name: z.string().trim().min(1).describe("Exact NexusAPI model_name value"),
    }),
  },
  async ({ model_name }) => {
    try {
      const openapi = await request("/openapi.json");
      const params = openapi?.components?.schemas?.GenerateRequest?.properties?.params;
      const ref = params?.discriminator?.mapping?.[model_name];
      if (!ref) throw new Error(`Unknown model_name in the live OpenAPI discriminator: ${model_name}`);
      const schemaName = ref.split("/").at(-1);
      const schema = openapi?.components?.schemas?.[schemaName];
      if (!schema) throw new Error(`OpenAPI schema not found: ${schemaName}`);
      return textResult({ model_name, schema_name: schemaName, schema });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "nexusapi_generate",
  {
    title: "Create a NexusAPI generation task",
    description: "Create a paid asynchronous generation task. Call nexusapi_get_model_schema first and ask the user to approve potentially billable generation.",
    inputSchema: z.object({
      model_name: z.string().trim().min(1).describe("Exact NexusAPI model_name value"),
      prompt: z.string().trim().min(1).describe("Generation instruction"),
      parameters: z.record(z.string(), z.unknown()).optional().describe("Additional fields allowed by the live schema for this model"),
    }),
  },
  async ({ model_name, prompt, parameters = {} }) => {
    try {
      const task = await request("/generate", {
        authenticated: true,
        method: "POST",
        body: JSON.stringify({
          params: { ...parameters, model_name, prompt },
        }),
      });
      return textResult(task);
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "nexusapi_get_task",
  {
    title: "Get a NexusAPI task",
    description: "Get the status, result or error of a previously created NexusAPI generation task.",
    inputSchema: z.object({
      task_id: z.string().trim().min(1).describe("Task id returned by nexusapi_generate"),
    }),
  },
  async ({ task_id }) => {
    try {
      return textResult(
        await request(`/tasks/${encodeURIComponent(task_id)}`, { authenticated: true }),
      );
    } catch (error) {
      return errorResult(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

