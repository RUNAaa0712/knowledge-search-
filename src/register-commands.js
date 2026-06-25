import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

const searchCommand = new SlashCommandBuilder()
  .setName("search-knowledge")
  .setDescription("フォーラムの既出投稿を検索します")
  .addStringOption((option) =>
    option.setName("query").setDescription("検索したい質問・バグ・要望").setRequired(true)
  );

const syncCommand = new SlashCommandBuilder()
  .setName("sync-knowledge")
  .setDescription("設定済みフォーラムをナレッジとして同期します")
  .addIntegerOption((option) =>
    option
      .setName("limit")
      .setDescription("フォーラムごとに同期する最大スレッド数。0 または未指定で全件")
      .setMinValue(0)
      .setRequired(false)
  );

const commands = [searchCommand, syncCommand].map((command) => command.toJSON());
const rest = new REST({ version: "10" }).setToken(config.discordToken);

if (config.discordGuildId) {
  await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), {
    body: commands
  });
  console.log(`Registered guild commands for ${config.discordGuildId}`);
} else {
  await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands });
  console.log("Registered global commands");
}
