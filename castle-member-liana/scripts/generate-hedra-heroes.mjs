#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const API_BASE = "https://api.hedra.com/web-app/public";
const OUTPUT_DIR = path.resolve("client/public/liana/generated");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "hedra-heroes.json");
const DEFAULT_MODEL_QUERY = "GPT Image 1.5 I2I";
const DEFAULT_ASPECT_RATIO = "16:9";
const RESOLUTION_CANDIDATES = ["1536x1024", "1024x1024", "1024x1536"];
const POLL_INTERVAL_MS = 8000;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;

const HERO_SPECS = [
  {
    id: "hedra-lunar-terrace",
    label: "Hedra Lunar Terrace",
    referencePath: path.resolve("client/public/liana/converted/IMG_1105.jpg"),
    prompt:
      "Using the reference image for likeness and styling, create a photoreal cinematic landscape hero image of Liana Camaras on a mountain-view terrace at blue hour. Preserve her identity, joyful mystic presence, and editorial realism while widening the composition into a premium website hero with lunar teal and burnished gold atmosphere, subtle eclipse light in the clouds, no text, no watermark."
  },
  {
    id: "hedra-eclipse-forge",
    label: "Hedra Eclipse Forge",
    referencePath: path.resolve("client/public/liana/summit-sky-hero-flat-v3.png"),
    prompt:
      "Using the reference image for likeness and pose energy, create a photoreal wide landscape hero image of Liana Camaras in a mythic lunar forge courtyard. Preserve her identity and upscale the scene into a cinematic homepage hero with warm gold firelight meeting cool teal moonlight, mountains in the distance, mystical but grounded atmosphere, no text, no watermark."
  },
  {
    id: "hedra-sun-covenant",
    label: "Hedra Sun Covenant",
    referencePath: path.resolve("client/public/liana/converted/IMG_5706.jpg"),
    prompt:
      "Using the reference image for likeness, create a photoreal wide landscape hero image of Liana Camaras in sunlit mountain stillness. Preserve her identity, mood, and wardrobe palette while expanding the scene into sophisticated editorial photography with expansive sky, radiant calm, immersive luxury-web energy, no text, no watermark."
  }
];

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }

    values.set(key, next);
    index += 1;
  }

  return { flags, values };
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

async function getApiKey(args) {
  if (process.env.HEDRA_API_KEY?.trim()) {
    return process.env.HEDRA_API_KEY.trim();
  }

  if (args.flags.has("api-key-stdin")) {
    const value = await readStdin();
    if (!value) {
      throw new Error("Expected Hedra API key on stdin.");
    }

    return value;
  }

  throw new Error("Set HEDRA_API_KEY or pass --api-key-stdin and provide the key via stdin.");
}

async function hedraFetch(endpoint, apiKey, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(options.headers ?? {}),
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errorMessage =
      typeof body === "string" ? body : JSON.stringify(body, null, 2);
    throw new Error(`Hedra ${response.status} ${response.statusText}: ${errorMessage}`);
  }

  return body;
}

async function createAsset(apiKey, name, type = "image") {
  return hedraFetch("/assets", apiKey, {
    method: "POST",
    body: JSON.stringify({
      name,
      type,
    }),
  });
}

async function uploadAssetFile(apiKey, assetId, localPath) {
  const fileBuffer = await fs.readFile(localPath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), path.basename(localPath));

  const response = await fetch(`${API_BASE}/assets/${assetId}/upload`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
    },
    body: formData,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errorMessage =
      typeof body === "string" ? body : JSON.stringify(body, null, 2);
    throw new Error(`Hedra upload ${response.status} ${response.statusText}: ${errorMessage}`);
  }

  return body;
}

function simplifyModel(model) {
  return {
    id: model.id,
    name: model.name ?? null,
    label: model.label ?? null,
    slug: model.slug ?? null,
    type: model.type ?? model.asset_type ?? model.media_type ?? null,
    provider: model.provider ?? null,
    metadata: model.metadata ?? null,
  };
}

function normalizeForMatch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textFields(model) {
  return [
    model.id,
    model.name,
    model.label,
    model.slug,
    model.provider,
    model.type,
    model.asset_type,
    model.media_type,
    model.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function resolveModel(models, query) {
  const normalizedQuery = normalizeForMatch(query);
  const matches = models.filter((model) => {
    const haystack = normalizeForMatch(textFields(model));
    return haystack.includes(normalizedQuery);
  });

  if (matches.length > 0) {
    return matches[0];
  }

  const imageModels = models.filter((model) => {
    const haystack = textFields(model);
    return haystack.includes("image") || haystack.includes("photo");
  });

  if (imageModels.length > 0) {
    return imageModels[0];
  }

  throw new Error(`Unable to find a Hedra model matching "${query}".`);
}

function attachReferenceVariants(candidates, referenceImageId) {
  if (!referenceImageId) {
    return candidates;
  }

  return candidates.flatMap((candidate) => [
    {
      label: `${candidate.label}-start-keyframe`,
      payload: {
        ...candidate.payload,
        start_keyframe_id: referenceImageId,
      },
    },
    {
      label: `${candidate.label}-reference-image`,
      payload: {
        ...candidate.payload,
        reference_image_ids: [referenceImageId],
      },
    },
    {
      label: `${candidate.label}-start-and-reference`,
      payload: {
        ...candidate.payload,
        start_keyframe_id: referenceImageId,
        reference_image_ids: [referenceImageId],
      },
    },
  ]);
}

function buildImagePayloadCandidates({ modelId, prompt, aspectRatio, resolution, referenceImageId }) {
  const baseCandidates = [
    {
      label: "top-level-image",
      payload: {
        type: "image",
        ai_model_id: modelId,
        text_prompt: prompt,
        aspect_ratio: aspectRatio,
        resolution,
        batch_size: 1,
      },
    },
    {
      label: "top-level-image-with-prompt",
      payload: {
        type: "image",
        ai_model_id: modelId,
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        batch_size: 1,
      },
    },
    {
      label: "top-level-image-no-aspect-ratio",
      payload: {
        type: "image",
        ai_model_id: modelId,
        text_prompt: prompt,
        resolution,
        batch_size: 1,
      },
    },
    {
      label: "top-level-image-size",
      payload: {
        type: "image",
        ai_model_id: modelId,
        text_prompt: prompt,
        size: resolution,
        batch_size: 1,
      },
    },
    {
      label: "top-level-image-dimension-as-aspect",
      payload: {
        type: "image",
        ai_model_id: modelId,
        text_prompt: prompt,
        aspect_ratio: resolution,
        batch_size: 1,
      },
    },
    {
      label: "nested-generated-image",
      payload: {
        type: "image",
        ai_model_id: modelId,
        generated_image_inputs: {
          text_prompt: prompt,
          aspect_ratio: aspectRatio,
          resolution,
          enhance_prompt: false,
        },
        batch_size: 1,
      },
    },
    {
      label: "nested-generated-image-with-prompt",
      payload: {
        type: "image",
        ai_model_id: modelId,
        generated_image_inputs: {
          prompt,
          aspect_ratio: aspectRatio,
          resolution,
          enhance_prompt: false,
        },
        batch_size: 1,
      },
    },
    {
      label: "nested-generated-image-no-aspect-ratio",
      payload: {
        type: "image",
        ai_model_id: modelId,
        generated_image_inputs: {
          text_prompt: prompt,
          resolution,
          enhance_prompt: false,
        },
        batch_size: 1,
      },
    },
    {
      label: "nested-generated-image-size",
      payload: {
        type: "image",
        ai_model_id: modelId,
        generated_image_inputs: {
          text_prompt: prompt,
          size: resolution,
          enhance_prompt: false,
        },
        batch_size: 1,
      },
    },
    {
      label: "nested-generated-image-dimension-as-aspect",
      payload: {
        type: "image",
        ai_model_id: modelId,
        generated_image_inputs: {
          text_prompt: prompt,
          aspect_ratio: resolution,
          enhance_prompt: false,
        },
        batch_size: 1,
      },
    },
    {
      label: "nested-generated-image-with-enhance",
      payload: {
        type: "image",
        ai_model_id: modelId,
        generated_image_inputs: {
          text_prompt: prompt,
          aspect_ratio: aspectRatio,
          resolution,
          enhance_prompt: true,
        },
        batch_size: 1,
      },
    },
    {
      label: "nested-generated-image-with-enhance-no-aspect-ratio",
      payload: {
        type: "image",
        ai_model_id: modelId,
        generated_image_inputs: {
          text_prompt: prompt,
          resolution,
          enhance_prompt: true,
        },
        batch_size: 1,
      },
    },
  ];

  return attachReferenceVariants(baseCandidates, referenceImageId);
}

async function generateImageAsset(apiKey, modelId, prompt, referenceImageId) {
  let lastError = null;
  const failures = [];

  for (const resolution of RESOLUTION_CANDIDATES) {
    const candidates = buildImagePayloadCandidates({
      modelId,
      prompt,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      resolution,
      referenceImageId,
    });

    for (const candidate of candidates) {
      try {
        const result = await hedraFetch("/generations", apiKey, {
          method: "POST",
          body: JSON.stringify(candidate.payload),
        });

        const generationId =
          result.id ??
          result.generation_id ??
          result.batch_generation_id;

        if (!generationId) {
          throw new Error(`Hedra did not return a generation id for ${candidate.label}.`);
        }

        const status = await waitForGeneration(apiKey, generationId);

        return {
          resolution,
          requestShape: candidate.label,
          result,
          status,
        };
      } catch (error) {
        failures.push({
          resolution,
          requestShape: candidate.label,
          stage: "submit-or-status",
          message: error instanceof Error ? error.message : String(error),
        });
        lastError = error;
      }
    }
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ failures }, null, 2));
  }

  throw lastError ?? new Error("Image generation failed before a request was sent.");
}

async function waitForGeneration(apiKey, generationId) {
  const start = Date.now();

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const status = await hedraFetch(`/generations/${generationId}/status`, apiKey, {
      method: "GET",
      headers: {
        "Content-Type": undefined,
      },
    });

    if (status.status === "complete") {
      return status;
    }

    if (status.status === "error") {
      throw new Error(status.error_message || `Generation ${generationId} failed.`);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }

  throw new Error(`Timed out waiting for generation ${generationId}.`);
}

async function findAssetById(apiKey, assetId, type = "image") {
  const result = await hedraFetch(
    `/assets?type=${encodeURIComponent(type)}&ids=${encodeURIComponent(assetId)}`,
    apiKey,
    {
      method: "GET",
      headers: {
        "Content-Type": undefined,
      },
    }
  );

  const items = Array.isArray(result) ? result : result.data ?? result.assets ?? [];
  return items.find((item) => item.id === assetId) ?? items[0] ?? null;
}

function extensionFromContentType(contentType) {
  if (contentType.includes("image/png")) {
    return ".png";
  }

  if (contentType.includes("image/webp")) {
    return ".webp";
  }

  if (contentType.includes("image/jpeg")) {
    return ".jpg";
  }

  return ".jpg";
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destinationPath, buffer);

  return {
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    size: buffer.byteLength,
  };
}

function publicPathFor(fileName) {
  return `/liana/generated/${fileName}`;
}

async function generateHeroSet(apiKey, modelQuery) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const rawModels = await hedraFetch("/models", apiKey, {
    method: "GET",
    headers: {
      "Content-Type": undefined,
    },
  });
  const models = Array.isArray(rawModels) ? rawModels : rawModels.models ?? [];
  const model = resolveModel(models, modelQuery);

  const manifest = {
    createdAt: new Date().toISOString(),
    modelQuery,
    model: simplifyModel(model),
    images: [],
  };

  for (const spec of HERO_SPECS) {
    console.log(`Uploading reference for ${spec.id} from ${spec.referencePath}...`);
    const referenceAsset = await createAsset(apiKey, `${spec.id}-reference`, "image");
    await uploadAssetFile(apiKey, referenceAsset.id, spec.referencePath);

    console.log(`Generating ${spec.id} with model ${model.id}...`);
    const generation = await generateImageAsset(apiKey, model.id, spec.prompt, referenceAsset.id);
    const generationId =
      generation.result.id ??
      generation.result.generation_id ??
      generation.result.batch_generation_id;
    const status = generation.status;
    let downloadUrl = status.download_url ?? status.url;

    if (!downloadUrl && status.asset_id) {
      const asset = await findAssetById(apiKey, status.asset_id, "image");
      downloadUrl = asset?.asset?.url ?? asset?.thumbnail_url ?? null;
    }

    if (!downloadUrl) {
      throw new Error(`No download URL returned for ${spec.id}.`);
    }

    const tempPath = path.join(OUTPUT_DIR, `${spec.id}.download`);
    const download = await downloadFile(downloadUrl, tempPath);
    const extension = extensionFromContentType(download.contentType);
    const finalFileName = `${spec.id}${extension}`;
    const finalPath = path.join(OUTPUT_DIR, finalFileName);

    await fs.rename(tempPath, finalPath);

    manifest.images.push({
      id: spec.id,
      label: spec.label,
      prompt: spec.prompt,
      path: publicPathFor(finalFileName),
      generationId,
      referenceSourcePath: spec.referencePath,
      referenceAssetId: referenceAsset.id,
      assetId: status.asset_id ?? generation.result.asset_id ?? null,
      resolution: generation.resolution,
      requestShape: generation.requestShape,
      contentType: download.contentType,
      size: download.size,
      createdAt: new Date().toISOString(),
    });
  }

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(JSON.stringify(manifest, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = await getApiKey(args);

  if (args.flags.has("list-models")) {
    const models = await hedraFetch("/models", apiKey, {
      method: "GET",
      headers: {
        "Content-Type": undefined,
      },
    });
    const list = Array.isArray(models) ? models : models.models ?? [];
    const simplified = list.map(simplifyModel);
    console.log(JSON.stringify(simplified, null, 2));
    return;
  }

  await generateHeroSet(apiKey, args.values.get("model") ?? DEFAULT_MODEL_QUERY);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
