import { fallbackDecision } from "./gemini.js";
import { rankCandidatesFromIterable } from "./text-score.js";

export class KnowledgeSearch {
  constructor(store, judge, candidateLimit) {
    this.store = store;
    this.judge = judge;
    this.candidateLimit = candidateLimit;
  }

  async search(query, excludedThreadId) {
    const candidates = await rankCandidatesFromIterable(
      query,
      this.store.entries(),
      this.candidateLimit,
      excludedThreadId
    );

    try {
      const decision = await this.judge.judge(query, candidates);
      return { decision, candidates, usedFallback: false };
    } catch (error) {
      console.error("Gemini duplicate judge failed:", error);
      return { decision: fallbackDecision(candidates), candidates, usedFallback: true };
    }
  }

  findCandidatesByDecision(result) {
    const ids = new Set(result.decision.matches.map((match) => match.id));
    return result.candidates.filter((candidate) => ids.has(candidate.id));
  }
}
