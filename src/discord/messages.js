export function formatSearchReply(query, result, forums, search, guildId) {
  const displayedCandidates = selectDisplayedCandidates(result, search);

  if (displayedCandidates.length > 0) {
    const lines = displayedCandidates.map((candidate, index) => {
      const match = result.decision.matches.find((item) => item.id === candidate.id);
      const reason = match?.reason ? `\n   ${match.reason}` : "";
      return `${index + 1}. [${candidate.title}](<${candidate.url}>)\n   ${candidate.forumName}${reason}`;
    });

    return [
      result.decision.duplicate ? "似ている投稿が見つかりました。" : "確認すると良さそうな投稿が見つかりました。",
      result.decision.summary,
      "",
      ...lines
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "近い既出投稿は見つかりませんでした。",
    result.decision.summary,
    "",
    "新規投稿する場合は、内容に近いフォーラムへ投稿してください。",
    ...forums.map((forum) => `- ${forum.name}: https://discord.com/channels/${guildId}/${forum.id}`),
    "",
    `検索した内容: ${query}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatThreadDuplicateReply(result, search) {
  const displayedCandidates = selectDisplayedCandidates(result, search);
  if (!result.decision.duplicate || displayedCandidates.length === 0) {
    return "";
  }

  return [
    "似ている投稿が見つかりました。既出の場合は、下記の投稿へ情報を集約すると探しやすくなります。",
    result.decision.summary,
    "",
    ...displayedCandidates.map((candidate, index) => `${index + 1}. [${candidate.title}](<${candidate.url}>)`)
  ]
    .filter(Boolean)
    .join("\n");
}

function selectDisplayedCandidates(result, search) {
  const matchedCandidates = search.findCandidatesByDecision(result);
  if (matchedCandidates.length > 0) {
    return matchedCandidates;
  }

  if (result.decision.duplicate) {
    return result.candidates.slice(0, 3);
  }

  return result.candidates.filter((candidate) => candidate.score >= 1.5).slice(0, 3);
}
