const { SlashCommandBuilder } = require('discord.js');

const PLAY_COMMANDS = new Set(['play', 'tocar']);

const slashCommands = [
  new SlashCommandBuilder()
    .setName('entrar')
    .setDescription('Entra no teu canal de voz e mostra o painel do NoxMusic'),
  new SlashCommandBuilder()
    .setName('sair')
    .setDescription('Sai do canal de voz'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Mostra o painel de reprodução'),
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Volta a publicar o painel com controlos'),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música no Discord. Não precisa do Spotify aberto.')
    .addStringOption((option) =>
      option
        .setName('musica')
        .setDescription('Nome da música, ou link do YouTube / Spotify')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('tocar')
    .setDescription('Igual ao /play — toca uma música no Discord')
    .addStringOption((option) =>
      option
        .setName('musica')
        .setDescription('Nome da música, ou link do YouTube / Spotify')
        .setRequired(true),
    ),
].map((command) => command.toJSON());

const COMMAND_NAMES = slashCommands.map((command) => command.name);

let lastRegistration = {
  ok: false,
  applicationId: null,
  commands: [],
  guilds: [],
  error: 'not-registered',
  at: null,
};

function getRegistration() {
  return lastRegistration;
}

function isPlayCommand(name) {
  return PLAY_COMMANDS.has(name);
}

function playArgsFrom(interaction) {
  if (!interaction?.options?.getString) {
    return '';
  }
  return interaction.options.getString('musica') || interaction.options.getString('query') || '';
}

async function registerSlashCommands(client) {
  const applicationId = client.application?.id;
  if (!applicationId) {
    lastRegistration = {
      ok: false,
      applicationId: null,
      commands: [],
      guilds: [],
      error: 'missing-application-id',
      at: new Date().toISOString(),
    };
    throw new Error('Discord application id indisponível; não registrei /play.');
  }

  const guilds = [];
  const errors = [];

  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.commands.set(slashCommands);
      guilds.push({
        id: guild.id,
        name: guild.name,
        commands: COMMAND_NAMES,
      });
    } catch (error) {
      errors.push(`${guild.name || guild.id}: ${error.message}`);
    }
  }

  try {
    if (client.application.commands?.set) {
      await client.application.commands.set(slashCommands);
    }
  } catch (error) {
    errors.push(`global: ${error.message}`);
  }

  lastRegistration = {
    ok: guilds.length > 0 && errors.length === 0,
    applicationId,
    commands: COMMAND_NAMES,
    guilds,
    error: errors.join('; ') || null,
    at: new Date().toISOString(),
  };

  console.log(
    `[discord] Slash commands [${COMMAND_NAMES.join(', ')}] app=${applicationId} guilds=${guilds.map((guild) => guild.name).join(', ') || 'none'}`,
  );
  if (lastRegistration.error) {
    console.error('[discord] Slash registration issues:', lastRegistration.error);
  }

  if (!guilds.length && errors.length) {
    throw new Error(lastRegistration.error);
  }

  return lastRegistration;
}

module.exports = {
  slashCommands,
  COMMAND_NAMES,
  PLAY_COMMANDS,
  registerSlashCommands,
  getRegistration,
  isPlayCommand,
  playArgsFrom,
};
