import os

from nexusapi_client import NexusAPIClient


client = NexusAPIClient(os.environ["NEXUS_API_KEY"])
task_id = client.generate(
    {
        "model_name": "kling-v3",
        "prompt": "Cinematic aerial shot of a mountain lake at sunrise",
        "duration": 5,
        "aspect_ratio": "16:9",
    }
)

print(f"Created task: {task_id}")
print(client.wait(task_id))

