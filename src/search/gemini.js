import { GoogleGenAI, Type } from "@google/genai";

const FALLBACK_DECISION = {
  duplicate: false,
  confidence: 0,
  summary: "近い投稿は見つかりませんでした。",
  matches: []
};

export class GeminiDuplicateJudge {
  constructor(apiKey, model) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async judge(query, candidates) {
    if (candidates.length === 0) {
      return {
        duplicate: false,
        confidence: 0.2,
        summary: "ローカル検索で近い投稿は見つかりませんでした。",
        matches: []
      };
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: buildPrompt(query, candidates),
      config: {
        systemInstruction:
          "あなたはDiscordコミュニティのナレッジ検索係です。問い合わせが既存フォーラム投稿と実質的に同じ問題・質問・要望かを厳密に判定します。ユーザーに見せる自然な短文を作り、JSONだけを返します。",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            duplicate: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            matches: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  relevance: { type: Type.NUMBER },
                  reason: { type: Type.STRING }
                },
                required: ["id", "relevance", "reason"]
              }
            }
          },
          required: ["duplicate", "confidence", "summary", "matches"]
        }
      }
    });

    return parseDecision(response.text ?? "");
  }
}

export function fallbackDecision(candidates) {
  if (candidates.length === 0) {
    return FALLBACK_DECISION;
  }

  const [top] = candidates;
  return {
    duplicate: top.score >= 2.5,
    confidence: Math.min(top.score / 5, 0.75),
    summary: "内容が近そうな投稿が見つかりました。確認してみてください。",
    matches: candidates.slice(0, 3).map((candidate) => ({
      id: candidate.id,
      relevance: Math.min(candidate.score / 5, 1),
      reason: "タイトルや本文に近い表現があります。"
    }))
  };
}

function buildPrompt(query, candidates) {
  const compactCandidates = candidates.map((candidate) => ({
    id: candidate.id,
    forum: candidate.forumName,
    kind: candidate.forumKind,
    title: candidate.title,
    content: trim(candidate.content, 900),
    tags: candidate.tags,
    localScore: candidate.score
  }));

  return JSON.stringify(
    {
      task:
        "user_query が candidates の既存投稿と実質的に重複しているか判定してください。単語が似ていても原因や目的が違う場合は duplicate=false にしてください。",
      user_query: query,
      candidates: compactCandidates,
      output_rules: {
        duplicate: "同じ質問・同じバグ・同じ機能要望として扱える場合のみ true",
        confidence: "0から1",
        summary: "ユーザー向けの自然な日本語で1文。内部処理やAI判定という言葉は使わない",
        matches: "重複と判断した、または確認すると役に立つ候補だけ。最大3件。reasonもユーザー向けに簡潔に書く"
      }
    },
    null,
    2
  );
}

function parseDecision(raw) {
  const parsed = JSON.parse(raw);
  return {
    duplicate: Boolean(parsed.duplicate),
    confidence: clampNumber(parsed.confidence, 0, 1),
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    matches: Array.isArray(parsed.matches)
      ? parsed.matches
          .filter((match) => typeof match.id === "string")
          .slice(0, 3)
          .map((match) => ({
            id: match.id,
            relevance: clampNumber(match.relevance, 0, 1),
            reason: typeof match.reason === "string" ? match.reason : ""
          }))
      : []
  };
}

function clampNumber(value, min, max) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function trim(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}
