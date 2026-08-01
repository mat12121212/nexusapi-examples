# n8n workflow

The workflow starts a `kling-v3` task, waits five seconds between status checks, returns the result on `completed`, and stops with the API error on `failed`.

Before running it:

1. Import `nexusapi-generate-and-wait.json` into n8n.
2. On self-hosted n8n, expose `NEXUS_API_KEY` to the process. On n8n Cloud, replace the header expression with an HTTP Header Auth credential.
3. Open **Generation input** and review the model-specific fields against the live [OpenAPI document](https://nexusapi.dev/openapi.json).
4. Execute manually once before activating a scheduled or webhook trigger. A successful request can incur charges.

The example intentionally uses polling because it is portable. For higher volume, use a webhook-based design and keep `task_id` as the idempotency key in your own system.

