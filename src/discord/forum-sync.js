import { ChannelType } from "discord.js";
import { devLog } from "../dev-log.js";

export async function collectForumEntries(channels, config, limitPerForum) {
  const entries = [];
  const maxThreadsPerForum = normalizeLimit(limitPerForum);
  const channelList = [...channels];

  devLog("knowledge sync started", {
    configuredForums: config.forums.length,
    limitPerForum: Number.isFinite(maxThreadsPerForum) ? maxThreadsPerForum : "all"
  });

  for (const forumConfig of config.forums) {
    const channel = channelList.find((candidate) => candidate.id === forumConfig.id);
    if (!channel || channel.type !== ChannelType.GuildForum) {
      console.warn(`Configured forum channel not found or not a forum: ${forumConfig.id}`);
      devLog("forum channel lookup failed", {
        configuredForum: forumConfig,
        foundChannelType: channel?.type,
        availableForumChannels: channelList
          .filter((candidate) => candidate.type === ChannelType.GuildForum)
          .map((candidate) => ({ id: candidate.id, name: candidate.name }))
      });
      continue;
    }

    devLog("forum channel found", {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      availableTags: channel.availableTags?.map((tag) => tag.name) ?? []
    });

    const threads = await fetchForumThreads(channel, maxThreadsPerForum);
    let savedForForum = 0;
    let withoutContent = 0;

    for (const thread of threads) {
      const entry = await threadToEntry(thread, config);
      if (entry) {
        entries.push(entry);
        savedForForum += 1;
        if (!entry.content) {
          withoutContent += 1;
        }
      }
    }

    devLog("forum sync completed", {
      forumId: forumConfig.id,
      forumName: forumConfig.name,
      fetchedThreads: threads.length,
      savedEntries: savedForForum,
      entriesWithoutContent: withoutContent
    });
  }

  devLog("knowledge sync completed", {
    totalEntries: entries.length
  });

  return entries;
}

export async function threadToEntry(thread, config) {
  if (!thread.parentId) {
    return undefined;
  }

  const forum = config.forums.find((candidate) => candidate.id === thread.parentId);
  if (!forum) {
    return undefined;
  }

  const starterMessage = await fetchStarterMessage(thread);
  const content = starterMessage?.content?.trim() ?? "";
  const tags = collectTagNames(thread);
  const messageId = starterMessage?.id;
  const guildId = thread.guild.id;
  const url = messageId
    ? `https://discord.com/channels/${guildId}/${thread.id}/${messageId}`
    : `https://discord.com/channels/${guildId}/${thread.id}`;

  return {
    id: thread.id,
    forumId: forum.id,
    forumName: forum.name,
    forumKind: forum.kind,
    threadId: thread.id,
    messageId,
    title: thread.name,
    content,
    tags,
    url,
    createdAt: thread.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function fetchForumThreads(forum, limitPerForum) {
  const byId = new Map();
  const active = await forum.threads.fetchActive();
  let activeThreads = 0;

  for (const thread of active.threads.values()) {
    if (thread.type === ChannelType.PublicThread) {
      byId.set(thread.id, thread);
      activeThreads += 1;
      if (byId.size >= limitPerForum) {
        devLog("forum thread fetch reached limit during active fetch", {
          forumId: forum.id,
          forumName: forum.name,
          activeThreads,
          totalThreads: byId.size
        });
        return [...byId.values()];
      }
    }
  }

  devLog("active forum threads fetched", {
    forumId: forum.id,
    forumName: forum.name,
    activeThreads
  });

  let before;
  let archivedPages = 0;
  let archivedThreads = 0;

  while (byId.size < limitPerForum) {
    const remaining = limitPerForum - byId.size;
    const archived = await forum.threads.fetchArchived({
      type: "public",
      limit: Math.min(100, remaining),
      before
    });

    archivedPages += 1;
    let pagePublicThreads = 0;

    for (const thread of archived.threads.values()) {
      if (thread.type === ChannelType.PublicThread) {
        byId.set(thread.id, thread);
        archivedThreads += 1;
        pagePublicThreads += 1;
      }
    }

    devLog("archived forum thread page fetched", {
      forumId: forum.id,
      forumName: forum.name,
      page: archivedPages,
      pageThreads: pagePublicThreads,
      totalThreads: byId.size,
      hasMore: Boolean(archived.hasMore),
      before: before instanceof Date ? before.toISOString() : before
    });

    if (!archived.hasMore || archived.threads.size === 0) {
      break;
    }

    before = getArchiveCursor([...archived.threads.values()]);
    if (!before) {
      break;
    }
  }

  devLog("forum thread fetch completed", {
    forumId: forum.id,
    forumName: forum.name,
    activeThreads,
    archivedPages,
    archivedThreads,
    totalThreads: byId.size
  });

  return [...byId.values()].slice(0, limitPerForum);
}

function normalizeLimit(limitPerForum) {
  if (!Number.isFinite(limitPerForum) || limitPerForum <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return limitPerForum;
}

function getArchiveCursor(threads) {
  const lastThread = threads.at(-1);
  return lastThread?.archivedAt ?? lastThread?.archiveTimestamp ?? lastThread?.createdAt;
}

async function fetchStarterMessage(thread) {
  try {
    return (await thread.fetchStarterMessage()) ?? undefined;
  } catch (error) {
    console.warn(`Failed to fetch starter message for thread ${thread.id}:`, error);
    return undefined;
  }
}

function collectTagNames(thread) {
  if (!("appliedTags" in thread) || !thread.parent || thread.parent.type !== ChannelType.GuildForum) {
    return [];
  }

  const availableTags = new Map(thread.parent.availableTags.map((tag) => [tag.id, tag.name]));
  return thread.appliedTags.map((tagId) => availableTags.get(tagId) ?? tagId);
}
