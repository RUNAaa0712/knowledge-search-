import { loadConfig } from "../config.js";
import { isDevelopmentMode } from "../dev-log.js";
import { rankCandidates } from "../search/text-score.js";
import { KnowledgeStore } from "../storage.js";

if (!isDevelopmentMode()) {
  console.error("debug:search is available only in development mode.");
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run debug:search -- "検索したい内容"');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const store = new KnowledgeStore(config.storePath);
  const entries = await store.all();
  const candidates = rankCandidates(query, entries, config.searchResultLimit);

  console.log("[debug:search] cache", {
    storePath: config.storePath,
    totalEntries: entries.length,
    entriesByForum: countBy(entries, "forumName"),
    entriesWithoutContent: entries.filter((entry) => !entry.content).length
  });

  console.log("[debug:search] query", query);

  if (candidates.length === 0) {
    console.log("[debug:search] no local candidates found");
    return;
  }

  console.log("[debug:search] local candidates");
  for (const [index, candidate] of candidates.entries()) {
    console.log(`${index + 1}. ${candidate.title}`);
    console.log(`   score: ${candidate.score}`);
    console.log(`   forum: ${candidate.forumName} (${candidate.forumKind})`);
    console.log(`   url: ${candidate.url}`);
    console.log(`   content: ${trim(candidate.content, 180) || "(no content)"}`);
  }
}

function countBy(entries, key) {
  return entries.reduce((result, entry) => {
    const value = entry[key] || "(unknown)";
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function trim(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}
