# NexusAPI MCP server, Python, Node.js and n8n examples

An open-source MCP server and production-minded examples for the asynchronous [NexusAPI](https://nexusapi.click/) generation flow.

## MCP tools for AI agents

The stdio server exposes four tools:

- `nexusapi_list_models` — search the live public model catalog;
- `nexusapi_get_model_schema` — inspect the live OpenAPI fields for one model;
- `nexusapi_generate` — create an asynchronous, potentially billable generation task;
- `nexusapi_get_task` — retrieve task status, result or error.

The server does not hide model-specific validation. Agents should inspect the live schema and obtain user approval before calling the billable generation tool.

After this repository is published, use it from a compatible local MCP host with:

```json
{
  "mcpServers": {
    "nexusapi": {
      "command": "npx",
      "args": ["-y", "github:mat12121212/nexusapi-examples"],
      "env": {
        "NEXUS_API_KEY": "replace-me"
      }
    }
  }
}
```

Requirements: Node.js 20+ and an existing NexusAPI key. The key remains in the local host environment; do not commit it to the repository.

The repository demonstrates one lifecycle shared by the model schemas published in the live NexusAPI OpenAPI document:

1. Send `POST /generate` with a `params` object.
2. Store the returned `task_id`.
3. Poll `GET /tasks/{task_id}` with bounded exponential backoff.
4. Stop on `completed` or `failed`.

The model-specific fields still come from the live schema. Do not copy parameters between models without checking the [NexusAPI documentation](https://nexusapi.click/docs) and [OpenAPI JSON](https://nexusapi.dev/openapi.json).

## Examples

- [`src/mcp-server.mjs`](src/mcp-server.mjs) — local MCP server over stdio.
- [`python/nexusapi_client.py`](python/nexusapi_client.py) — reusable synchronous Python client.
- [`python/kling_video.py`](python/kling_video.py) — Kling 3 text-to-video request.
- [`node/nexusapi-client.mjs`](node/nexusapi-client.mjs) — dependency-free Node.js 18+ client.
- [`node/gpt-image.mjs`](node/gpt-image.mjs) — GPT Image request.
- [`n8n/nexusapi-generate-and-wait.json`](n8n/nexusapi-generate-and-wait.json) — importable workflow with polling and failure handling.

## Quick start: Python

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export NEXUS_API_KEY="replace-me"
python python/kling_video.py
```

## Quick start: Node.js

```bash
export NEXUS_API_KEY="replace-me"
node node/gpt-image.mjs
```

## n8n

Import the JSON file from `n8n/`, then create the `NEXUS_API_KEY` environment variable in the n8n runtime. Review the model parameters before executing the workflow. A successful run can incur generation charges.

## Safety notes

- Keep the API key on the server. Never ship it in browser JavaScript.
- A client timeout does not prove that a generation stopped. Save `task_id` and check it again.
- Do not retry an ambiguous `POST /generate` automatically: the first request may have created a paid task.
- Treat `422` as a request/schema problem. Change the request before retrying.
- Respect `429` and temporary `5xx` responses with bounded backoff.
- Review every agent-proposed generation before allowing the billable MCP tool call.

## Verification

Verified against the live NexusAPI OpenAPI document and the official MCP TypeScript SDK v2 on **2026-08-01**. The included smoke test performs the MCP initialize handshake, lists tools and calls all four tools against a local mock API. No paid generation is used by the test.

## Disclosure

This repository is maintained for NexusAPI. The examples are open source under the MIT License; use of the API itself is governed by the service terms and pricing.
