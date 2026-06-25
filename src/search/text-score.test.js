import assert from "node:assert/strict";
import test from "node:test";
import { rankCandidates } from "./text-score.js";

const baseEntry = {
  forumId: "forum-1",
  forumName: "質問",
  forumKind: "question",
  tags: [],
  url: "https://discord.com/channels/guild/thread/message",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

test("ranks Japanese forum posts without whitespace segmentation", () => {
  const entries = [
    {
      ...baseEntry,
      id: "a",
      threadId: "a",
      title: "ログインできない問題",
      content: "二段階認証を有効にしたあと、ログイン画面で止まります。"
    },
    {
      ...baseEntry,
      id: "b",
      threadId: "b",
      title: "通知メールの要望",
      content: "毎週のまとめメールがほしいです。"
    }
  ];

  const [top] = rankCandidates("ログイン画面で止まる", entries, 3);

  assert.equal(top?.id, "a");
});

test("excludes the current thread when checking a new forum post", () => {
  const entries = [
    {
      ...baseEntry,
      id: "current",
      threadId: "current",
      title: "検索が遅い",
      content: "検索結果の表示が遅いです。"
    }
  ];

  const results = rankCandidates("検索が遅い", entries, 3, "current");

  assert.equal(results.length, 0);
});
