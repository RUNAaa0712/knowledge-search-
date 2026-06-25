import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { KnowledgeStore } from "./storage.js";

test("stores knowledge entries as separate JSON files", async () => {
  const root = await mkdtemp(join(tmpdir(), "knowledge-store-"));
  const store = new KnowledgeStore(root);

  await store.upsertMany([
    {
      id: "thread-1",
      forumId: "forum-1",
      forumName: "質問",
      forumKind: "question",
      threadId: "thread-1",
      title: "ログインできない",
      content: "ログイン画面で止まります。",
      tags: [],
      url: "https://discord.com/channels/guild/thread/message",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ]);

  const entries = [];
  for await (const entry of store.entries()) {
    entries.push(entry);
  }

  assert.equal(entries.length, 1);
  assert.equal(entries[0].threadId, "thread-1");
});
