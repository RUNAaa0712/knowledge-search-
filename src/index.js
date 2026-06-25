import { ChannelType, Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { ensureConfigPaths, loadConfig } from "./config.js";
import { collectForumEntries, threadToEntry } from "./discord/forum-sync.js";
import { formatSearchReply, formatThreadDuplicateReply } from "./discord/messages.js";
import { devLogOnce } from "./dev-log.js";
import { GeminiDuplicateJudge } from "./search/gemini.js";
import { KnowledgeSearch } from "./search/knowledge-search.js";
import { KnowledgeStore } from "./storage.js";

const config = loadConfig();
await ensureConfigPaths(config);

const store = new KnowledgeStore(config.storePath);
const judge = new GeminiDuplicateJudge(config.geminiApiKey, config.geminiModel);
const knowledgeSearch = new KnowledgeSearch(store, judge, config.searchResultLimit);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  devLogOnce("startup-config", "development mode startup config", {
    model: config.geminiModel,
    forums: config.forums.map((forum) => ({
      id: forum.id,
      name: forum.name,
      kind: forum.kind
    })),
    searchResultLimit: config.searchResultLimit,
    syncThreadLimit: config.syncThreadLimit,
    syncScope: config.syncThreadLimit > 0 ? `max ${config.syncThreadLimit} per forum` : "all posts",
    storePath: config.storePath,
    syncAllowedUsers: config.syncAllowedUserIds.length,
    enableThreadDuplicateReply: config.enableThreadDuplicateReply
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    if (interaction.commandName === "search-knowledge") {
      await handleSearchCommand(interaction);
      return;
    }

    if (interaction.commandName === "sync-knowledge") {
      await handleSyncCommand(interaction);
    }
  } catch (error) {
    console.error("Interaction handler failed:", error);
    const message = "処理中にエラーが発生しました。ログを確認してください。";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message);
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  }
});

client.on(Events.ThreadCreate, async (thread) => {
  if (!config.enableThreadDuplicateReply || !isConfiguredForumThread(thread)) {
    return;
  }

  try {
    await syncForumThread(thread, { checkDuplicate: true });
  } catch (error) {
    console.error("Thread duplicate check failed:", error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !isConfiguredForumThread(message.channel)) {
    return;
  }

  try {
    await syncForumThread(message.channel, { checkDuplicate: false });
  } catch (error) {
    console.error("Thread message sync failed:", error);
  }
});

await client.login(config.discordToken);

async function handleSearchCommand(interaction) {
  if (!interaction.isChatInputCommand() || !interaction.guildId) {
    return;
  }

  const query = interaction.options.getString("query", true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await knowledgeSearch.search(query);
  const reply = formatSearchReply(query, result, config.forums, knowledgeSearch, interaction.guildId);
  await interaction.editReply(reply);
}

async function handleSyncCommand(interaction) {
  if (!interaction.isChatInputCommand() || !interaction.guild) {
    return;
  }

  if (!isSyncAllowed(interaction.user.id)) {
    await interaction.reply({
      content: "このコマンドを実行する権限がありません。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const limit = interaction.options.getInteger("limit") ?? config.syncThreadLimit;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channels = await interaction.guild.channels.fetch();
  const entries = await collectForumEntries(
    [...channels.values()].filter((channel) => channel !== null),
    config,
    limit
  );
  await store.upsertMany(entries);

  const scope = limit > 0 ? `各フォーラム最大 ${limit} 件` : "全件";
  await interaction.editReply(`同期しました: ${entries.length} 件（${scope}）`);
}

async function syncForumThread(thread, { checkDuplicate }) {
  const entry = await threadToEntry(thread, config);
  if (!entry) {
    return;
  }

  let reply = "";
  if (checkDuplicate) {
    const query = `${entry.title}\n${entry.content}`;
    const result = await knowledgeSearch.search(query, entry.threadId);
    reply = formatThreadDuplicateReply(result, knowledgeSearch);
  }

  await store.upsertMany([entry]);

  if (reply) {
    await thread.send(reply);
  }
}

function isSyncAllowed(userId) {
  return config.syncAllowedUserIds.includes(userId);
}

function isConfiguredForumThread(thread) {
  return (
    thread.type === ChannelType.PublicThread &&
    Boolean(thread.parentId) &&
    config.forums.some((forum) => forum.id === thread.parentId)
  );
}
