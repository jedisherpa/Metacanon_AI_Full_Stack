#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

const API_BASE = "https://api.hedra.com/web-app/public";
const MODEL_NAME_CANDIDATES = [
  "GPT Image 1.5 I2I",
  "GPT-1.5_image_1.5",
  "GPT Image 1.5",
];

const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(PROJECT_ROOT, "client/public/diana/upscaled");
const argv = process.argv.slice(2);
const forceLandscape = argv.includes("--landscape");
const requestedKeys = new Set(argv.filter((arg) => !arg.startsWith("--")));

const HERO_IMAGES = [
  {
    key: "noir",
    inputPath: path.join(PROJECT_ROOT, "client/public/diana/Diana 3.png"),
    outputPath: path.join(OUTPUT_DIR, "hero-noir-gpt-image-1-5.png"),
    aspectRatio: "3:2",
    prompt:
      "Using the provided portrait as the reference, create a premium editorial upscale of Diana. Preserve her exact identity, face, expression, hair, wardrobe, pose, and camera perspective. Increase clarity, texture, tonal separation, and photographic polish while keeping the result faithful to the original source. Expand the frame into a cinematic landscape composition with tasteful natural background continuation, but do not change her styling, add props, alter anatomy, or make the image look synthetic."
  },
  {
    key: "forest",
    inputPath: path.join(PROJECT_ROOT, "client/public/diana/Diana 1.png"),
    outputPath: path.join(OUTPUT_DIR, "hero-forest-gpt-image-1-5.png"),
    aspectRatio: "3:2",
    prompt:
      "Using the provided portrait as the reference, create a high-end cinematic upscale of Diana in the forest. Preserve her exact identity, face, expression, hair, clothing, pose, and lighting direction. Improve realism, detail, depth, and color richness while staying faithful to the original photograph. Expand into a beautiful landscape frame with natural forest continuation where needed, keeping Diana as the unmistakable focal subject and avoiding props, distortions, or dramatic restyling."
  },
  {
    key: "shore",
    inputPath: path.join(PROJECT_ROOT, "client/public/diana/Diana 14.jpg"),
    outputPath: path.join(OUTPUT_DIR, "hero-shore-gpt-image-1-5.png"),
    aspectRatio: "3:2",
    prompt:
      "Using the provided portrait as the reference, create a luminous upscale of Diana at the shoreline with premium editorial quality. Preserve her exact identity, face, expression, hair, clothing, body proportions, pose, and mood. Enhance texture, detail, color, and photographic sharpness while keeping the scene realistic and faithful to the source image. Expand the framing into a cinematic landscape composition with elegant natural sky and shore continuation, without introducing new props, compositional distortion, or stylized artifacts."
  },
];

function withVariantSuffix(filePath, suffix) {
  const extension = path.extname(filePath);
  return filePath.slice(0, -extension.length) + suffix + extension;
}

async function getApiKey() {
  if (process.env.HEDRA_API_KEY) {
    return process.env.HEDRA_API_KEY;
  }

  if (process.stdin.isTTY) {
    throw new Error("HEDRA_API_KEY is required.");
  }

  const reader = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: false,
  });
  const value = (await reader.question("")).trim();
  reader.close();

  if (!value) {
    throw new Error("HEDRA_API_KEY is required.");
  }

  return value;
}

async function hedraFetch(apiKey, pathname, init = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey,
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorMessage =
      data?.detail ||
      data?.message ||
      data?.error?.message ||
      JSON.stringify(data ?? { status: response.status });
    throw new Error(`${response.status} ${response.statusText}: ${errorMessage}`);
  }

  return data;
}

function resolveModel(models) {
  for (const candidate of MODEL_NAME_CANDIDATES) {
    const exact = models.find((item) => item.name === candidate);
    if (exact) {
      return exact;
    }
  }

  return (
    models.find((item) =>
      MODEL_NAME_CANDIDATES.some((candidate) =>
        item.name.toLowerCase().includes(candidate.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
      )
    ) ??
    models.find((item) => item.type === "image")
  );
}

async function getModel(apiKey) {
  const models = await hedraFetch(apiKey, "/models", { method: "GET" });
  const model = resolveModel(models);

  if (!model) {
    throw new Error("Could not find a usable Hedra image model in /models response.");
  }

  return model;
}

async function createUploadAsset(apiKey, localPath) {
  const name = path.basename(localPath);
  const createResponse = await hedraFetch(apiKey, "/assets", {
    method: "POST",
    body: JSON.stringify({
      name,
      type: "image",
    }),
  });

  const fileBuffer = await readFile(localPath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer]), name);

  await hedraFetch(apiKey, `/assets/${createResponse.id}/upload`, {
    method: "POST",
    body: form,
  });

  return createResponse.id;
}

async function tryCreateGeneration(apiKey, modelId, assetId, prompt, aspectRatio) {
  const candidateBodies = [
    {
      type: "image",
      ai_model_id: modelId,
      text_prompt: prompt,
      start_keyframe_id: assetId,
      aspect_ratio: aspectRatio,
      resolution: "fixed",
      enhance_prompt: false,
    },
    {
      type: "image",
      ai_model_id: modelId,
      text_prompt: prompt,
      reference_image_ids: [assetId],
      aspect_ratio: aspectRatio,
      resolution: "fixed",
      enhance_prompt: false,
    },
    {
      type: "image",
      ai_model_id: modelId,
      text_prompt: prompt,
      start_keyframe_id: assetId,
      reference_image_ids: [assetId],
      aspect_ratio: aspectRatio,
      resolution: "fixed",
      enhance_prompt: false,
    },
  ];

  const errors = [];

  for (const body of candidateBodies) {
    try {
      return await hedraFetch(apiKey, "/generations", {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`All generation payload variants failed:\n${errors.join("\n")}`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGeneration(apiKey, generationId) {
  for (;;) {
    const status = await hedraFetch(apiKey, `/generations/${generationId}/status`, {
      method: "GET",
    });

    if (status.status === "complete") {
      return status;
    }

    if (status.status === "failed" || status.status === "error" || status.error_message) {
      throw new Error(
        `Generation ${generationId} failed: ${status.error_message ?? JSON.stringify(status.error ?? {})}`
      );
    }

    await sleep(4000);
  }
}

async function getAssetUrl(apiKey, assetId) {
  const results = await hedraFetch(apiKey, `/assets?type=image&ids=${encodeURIComponent(assetId)}`, {
    method: "GET",
  });

  const asset = Array.isArray(results) ? results[0] : null;
  const url = asset?.asset?.url;

  if (!url) {
    throw new Error(`Could not resolve asset URL for ${assetId}.`);
  }

  return url;
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuffer));
}

async function generateAll() {
  const apiKey = await getApiKey();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const model = await getModel(apiKey);
  console.log(`Using Hedra model ${model.name} (${model.id})`);

  const selectedImages =
    requestedKeys.size > 0
      ? HERO_IMAGES.filter((image) => requestedKeys.has(image.key))
      : HERO_IMAGES;

  for (const image of selectedImages) {
    const aspectRatio = forceLandscape ? "3:2" : image.aspectRatio;
    const outputPath = forceLandscape
      ? withVariantSuffix(image.outputPath, "-landscape")
      : image.outputPath;
    const prompt = forceLandscape
      ? `${image.prompt} Keep the output explicitly landscape and do not return a vertical crop.`
      : image.prompt;

    console.log(`\nGenerating ${image.key} from ${path.basename(image.inputPath)} at ${aspectRatio}...`);
    const assetId = await createUploadAsset(apiKey, image.inputPath);
    console.log(`Uploaded source asset ${assetId}`);

    const generation = await tryCreateGeneration(apiKey, model.id, assetId, prompt, aspectRatio);
    console.log(`Queued generation ${generation.id}`);

    const completed = await waitForGeneration(apiKey, generation.id);
    const generatedAssetId = completed.asset_id ?? completed.asset?.id;

    if (!generatedAssetId) {
      throw new Error(`Generation ${generation.id} completed without an asset_id.`);
    }

    const assetUrl = await getAssetUrl(apiKey, generatedAssetId);
    await downloadFile(assetUrl, outputPath);
    console.log(`Saved ${outputPath}`);
  }
}

generateAll().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
