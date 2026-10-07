require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

const int = (v, fallback, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const cfg = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.TEST_GUILD_ID,
  ownerId: process.env.OWNER_USER_ID,
  phrase: process.env.SAFETY_PHRASE || "ORBiS-TEST-ONLY",
  maxChannels: int(process.env.MAX_CHANNELS, 25, 1, 25),
  maxRoles: int(process.env.MAX_ROLES, 25, 1, 25),
  prefix: process.env.TEST_PREFIX || "orbis-test-"
};

if (!cfg.token || !cfg.guildId || !cfg.ownerId) {
  console.error("Missing DISCORD_TOKEN, TEST_GUILD_ID or OWNER_USER_ID in .env");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const state = { channels: new Set(), roles: new Set(), stopped: false };

const commands = [
  new SlashCommandBuilder().setName("setup-test").setDescription("Create marked test channels and roles.")
    .addIntegerOption(o => o.setName("channels").setDescription("1-25").setMinValue(1).setMaxValue(25))
    .addIntegerOption(o => o.setName("roles").setDescription("1-25").setMinValue(1).setMaxValue(25)),
  new SlashCommandBuilder().setName("attack").setDescription("Controlled deletion stress test.")
    .addIntegerOption(o => o.setName("channels").setDescription("1-25").setMinValue(1).setMaxValue(25).setRequired(true))
    .addIntegerOption(o => o.setName("roles").setDescription("1-25").setMinValue(1).setMaxValue(25).setRequired(true))
    .addStringOption(o => o.setName("safety").setDescription("Safety phrase").setRequired(true)),
  new SlashCommandBuilder().setName("cleanup").setDescription("Delete only tracked test resources."),
  new SlashCommandBuilder().setName("status").setDescription("Show test state.")
].map(x => x.toJSON());

const allowed = i => i.guildId === cfg.guildId && i.user.id === cfg.ownerId;

async function createResources(guild, channels, roles) {
  const created = { channels: [], roles: [] };
  for (let i = 0; i < roles; i++) {
    const r = await guild.roles.create({
      name: `${cfg.prefix}role-${Date.now()}-${i + 1}`,
      reason: "Orbis controlled anti-nuke test"
    });
    state.roles.add(r.id);
    created.roles.push(r);
  }
  for (let i = 0; i < channels; i++) {
    const c = await guild.channels.create({
      name: `${cfg.prefix}channel-${Date.now()}-${i + 1}`,
      type: ChannelType.GuildText,
      reason: "Orbis controlled anti-nuke test"
    });
    state.channels.add(c.id);
    created.channels.push(c);
  }
  return created;
}

async function deleteCreated(created) {
  state.stopped = false;
  for (const c of created.channels) {
    if (state.stopped) break;
    try {
      await c.delete("Orbis controlled deletion test");
      state.channels.delete(c.id);
    } catch (e) {
      console.log("[CHANNEL DELETE]", e.code || e.message);
      if (e.code === 50013 || e.code === 10003) state.stopped = true;
    }
  }
  if (state.stopped) return;
  for (const r of created.roles) {
    if (state.stopped) break;
    try {
      await r.delete("Orbis controlled deletion test");
      state.roles.delete(r.id);
    } catch (e) {
      console.log("[ROLE DELETE]", e.code || e.message);
      if (e.code === 50013 || e.code === 10011) state.stopped = true;
    }
  }
}

async function cleanup(guild) {
  for (const id of [...state.channels]) {
    const c = guild.channels.cache.get(id);
    if (c) await c.delete("Orbis test cleanup").catch(() => {});
    state.channels.delete(id);
  }
  for (const id of [...state.roles]) {
    const r = guild.roles.cache.get(id);
    if (r) await r.delete("Orbis test cleanup").catch(() => {});
    state.roles.delete(id);
  }
  state.stopped = false;
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Locked guild: ${cfg.guildId}`);
  const rest = new REST({ version: "10" }).setToken(cfg.token);
  await rest.put(Routes.applicationGuildCommands(client.user.id, cfg.guildId), { body: commands });
  console.log("Slash commands registered.");
});

client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;
  if (!allowed(i)) {
    return i.reply({ content: "⛔ Commande refusée : serveur ou utilisateur non autorisé.", ephemeral: true });
  }

  try {
    if (i.commandName === "status") {
      return i.reply({
        ephemeral: true,
        embeds: [new EmbedBuilder().setTitle("Orbis Test Bot")
          .addFields(
            { name: "Channels suivis", value: String(state.channels.size), inline: true },
            { name: "Rôles suivis", value: String(state.roles.size), inline: true },
            { name: "Test stoppé", value: state.stopped ? "Oui" : "Non", inline: true }
          )]
      });
    }

    if (i.commandName === "setup-test") {
      const channels = Math.min(i.options.getInteger("channels") ?? 5, cfg.maxChannels);
      const roles = Math.min(i.options.getInteger("roles") ?? 5, cfg.maxRoles);
      await i.deferReply({ ephemeral: true });
      const x = await createResources(i.guild, channels, roles);
      return i.editReply(`✅ Préparé : ${x.channels.length} salon(s), ${x.roles.length} rôle(s).`);
    }

    if (i.commandName === "attack") {
      const channels = i.options.getInteger("channels");
      const roles = i.options.getInteger("roles");
      const safety = i.options.getString("safety");
      if (channels > cfg.maxChannels || roles > cfg.maxRoles || safety !== cfg.phrase) {
        return i.reply({ content: "⛔ Limite ou phrase de sécurité incorrecte.", ephemeral: true });
      }
      await i.deferReply({ ephemeral: true });
      const x = await createResources(i.guild, channels, roles);
      await i.editReply(`⚠️ Stress-test : ${x.channels.length} suppressions de salons et ${x.roles.length} suppressions de rôles potentielles.`);
      await deleteCreated(x);
      console.log(`[TEST] stopped=${state.stopped} remaining channels=${state.channels.size} roles=${state.roles.size}`);
      return;
    }

    if (i.commandName === "cleanup") {
      await i.deferReply({ ephemeral: true });
      await cleanup(i.guild);
      return i.editReply("🧹 Nettoyage terminé.");
    }
  } catch (e) {
    console.error(e);
    const msg = "❌ Erreur pendant le test. Voir la console.";
    if (i.deferred || i.replied) await i.editReply(msg).catch(() => {});
    else await i.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
client.login(cfg.token);
