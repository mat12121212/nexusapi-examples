export class NexusAPIError extends Error {}

export class NexusAPIClient {
  constructor({ apiKey, baseUrl = "https://nexusapi.dev", requestTimeoutMs = 30_000 }) {
    if (!apiKey) throw new TypeError("apiKey must not be empty");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async request(path, options = {}) {
    const signal = AbortSignal.timeout(this.requestTimeoutMs);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 1000);
      throw new NexusAPIError(`NexusAPI returned HTTP ${response.status}: ${details}`);
    }
    return response.json();
  }

  async generate(params) {
    const payload = await this.request("/generate", {
      method: "POST",
      body: JSON.stringify({ params }),
    });
    if (typeof payload.task_id !== "string" || !payload.task_id) {
      throw new NexusAPIError("The accepted response did not contain task_id");
    }
    return payload.task_id;
  }

  getTask(taskId) {
    return this.request(`/tasks/${encodeURIComponent(taskId)}`);
  }

  async wait(taskId, { timeoutMs = 900_000, firstIntervalMs = 3_000, maxIntervalMs = 15_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let intervalMs = firstIntervalMs;

    while (Date.now() < deadline) {
      const task = await this.getTask(taskId);
      if (task.status === "completed") return task.result;
      if (task.status === "failed") {
        throw new NexusAPIError(task.error || "Generation failed");
      }
      if (!["queued", "pending", "processing"].includes(task.status)) {
        throw new NexusAPIError(`Unknown task status: ${JSON.stringify(task.status)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      intervalMs = Math.min(Math.round(intervalMs * 1.5), maxIntervalMs);
    }

    throw new Error(
      `Task ${taskId} timed out; it may still be running and can be checked later.`,
    );
  }
}
