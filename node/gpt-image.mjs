import { NexusAPIClient } from "./nexusapi-client.mjs";

const client = new NexusAPIClient({ apiKey: process.env.NEXUS_API_KEY });
const taskId = await client.generate({
  model_name: "gpt-image-2",
  prompt: "Editorial illustration of a modular API pipeline, dark background",
  aspect_ratio: "16:9",
});

console.log(`Created task: ${taskId}`);
console.log(await client.wait(taskId));

