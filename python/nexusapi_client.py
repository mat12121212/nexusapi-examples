"""Minimal synchronous NexusAPI client with bounded polling."""

from __future__ import annotations

import time
from typing import Any, Mapping

import requests


class NexusAPIError(RuntimeError):
    """Raised when NexusAPI rejects or fails a task."""


class NexusAPIClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://nexusapi.dev",
        request_timeout: float = 30.0,
    ) -> None:
        if not api_key:
            raise ValueError("api_key must not be empty")
        self.base_url = base_url.rstrip("/")
        self.request_timeout = request_timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
        )

    def _json(self, response: requests.Response) -> dict[str, Any]:
        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            details = response.text[:1000]
            raise NexusAPIError(
                f"NexusAPI returned HTTP {response.status_code}: {details}"
            ) from exc
        return response.json()

    def generate(self, params: Mapping[str, Any]) -> str:
        response = self.session.post(
            f"{self.base_url}/generate",
            json={"params": dict(params)},
            timeout=self.request_timeout,
        )
        payload = self._json(response)
        task_id = payload.get("task_id")
        if not isinstance(task_id, str) or not task_id:
            raise NexusAPIError("The accepted response did not contain task_id")
        return task_id

    def get_task(self, task_id: str) -> dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/tasks/{task_id}",
            timeout=self.request_timeout,
        )
        return self._json(response)

    def wait(
        self,
        task_id: str,
        timeout_seconds: float = 900,
        first_interval: float = 3,
        max_interval: float = 15,
    ) -> Any:
        deadline = time.monotonic() + timeout_seconds
        interval = first_interval

        while time.monotonic() < deadline:
            task = self.get_task(task_id)
            status = task.get("status")

            if status == "completed":
                return task.get("result")
            if status == "failed":
                raise NexusAPIError(task.get("error") or "Generation failed")
            if status not in {"queued", "pending", "processing"}:
                raise NexusAPIError(f"Unknown task status: {status!r}")

            time.sleep(interval)
            interval = min(interval * 1.5, max_interval)

        raise TimeoutError(
            f"Task {task_id} did not finish within {timeout_seconds} seconds; "
            "it may still be running and can be checked later."
        )
