import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";

export function loadConfig() {
  const discordToken = requiredEnv("DISCORD_TOKEN");
  const discordClientId = requiredEnv("DISCORD_CLIENT_ID");
  const geminiApiKey = requiredEnv("GEMINI_API_KEY");
  const storePath = process.env.KNOWLEDGE_STORE_PATH ?? "data/knowledge-store";

  return {
    discordToken,
    discordClientId,
    discordGuildId: blankToUndefined(process.env.DISCORD_GUILD_ID),
    geminiApiKey,
    geminiModel: process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
    forums: parseForums(requiredEnv("KNOWLEDGE_FORUMS")),
    storePath,
    searchResultLimit: parsePositiveInt(process.env.SEARCH_RESULT_LIMIT, 8),
    syncThreadLimit: parseNonNegativeInt(process.env.SYNC_THREAD_LIMIT, 0),
    syncAllowedUserIds: parseStringList(process.env.SYNC_ALLOWED_USER_IDS),
    enableThreadDuplicateReply: parseBoolean(process.env.ENABLE_THREAD_DUPLICATE_REPLY, true)
  };
}

export async function ensureConfigPaths(config) {
  await mkdir(dirname(config.storePath), { recursive: true });
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function blankToUndefined(value) {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function parsePositiveInt(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseNonNegativeInt(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(value, fallback) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseStringList(value) {
  if (!value || value.trim().length === 0) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseForums(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`KNOWLEDGE_FORUMS must be valid JSON: ${error.message}`);
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("KNOWLEDGE_FORUMS must be a non-empty array");
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`KNOWLEDGE_FORUMS[${index}] must be an object`);
    }

    const id = asNonEmptyString(item.id, `KNOWLEDGE_FORUMS[${index}].id`);
    const name = asNonEmptyString(item.name, `KNOWLEDGE_FORUMS[${index}].name`);
    const kind = normalizeForumKind(item.kind);

    return { id, name, kind };
  });
}

function normalizeForumKind(value) {
  if (value === "question" || value === "bug" || value === "feature" || value === "other") {
    return value;
  }

  return "other";
}

function asNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
