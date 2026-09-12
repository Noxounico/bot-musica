const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  slashCommands,
  COMMAND_NAMES,
  registerSlashCommands,
  getRegistration,
  isPlayCommand,
  playArgsFrom,
} = require('../src/commands');
const { handleRequest } = require('../src/health');

test('slash payload always includes /play and /tocar', () => {
  assert.deepEqual(COMMAND_NAMES, ['entrar', 'sair', 'status', 'painel', 'play', 'tocar']);
  const play = slashCommands.find((command) => command.name === 'play');
  const tocar = slashCommands.find((command) => command.name === 'tocar');
  assert.equal(play.options[0].name, 'musica');
  assert.equal(play.options[0].required, true);
  assert.equal(tocar.options[0].name, 'musica');
});

test('registerSlashCommands uses the logged-in application id, not env CLIENT_ID', async () => {
  const guildSets = [];
  const globalSets = [];
  const guild = {
    id: '1544330681277096046',
    name: 'Servidor de Nox Moedas',
    commands: {
      async set(commands) {
        guildSets.push(commands.map((command) => command.name));
        return commands;
      },
    },
  };
  const client = {
    application: {
      id: '1548283020371435570',
      commands: {
        async set(commands) {
          globalSets.push(commands.map((command) => command.name));
          return commands;
        },
      },
    },
    guilds: {
      cache: new Map([[guild.id, guild]]),
    },
  };

  const result = await registerSlashCommands(client);
  assert.equal(result.applicationId, '1548283020371435570');
  assert.deepEqual(guildSets[0], COMMAND_NAMES);
  assert.deepEqual(globalSets[0], COMMAND_NAMES);
  assert.equal(result.ok, true);
  assert.ok(result.commands.includes('play'));
  assert.deepEqual(getRegistration().commands, COMMAND_NAMES);
});

test('registerSlashCommands fails clearly without an application id', async () => {
  await assert.rejects(
    () => registerSlashCommands({ application: {}, guilds: { cache: new Map() } }),
    /application id/,
  );
  assert.equal(getRegistration().error, 'missing-application-id');
});

test('play helpers treat /tocar like /play', () => {
  assert.equal(isPlayCommand('play'), true);
  assert.equal(isPlayCommand('tocar'), true);
  assert.equal(isPlayCommand('entrar'), false);
  assert.equal(
    playArgsFrom({ options: { getString: (name) => (name === 'musica' ? 'bohemian rhapsody' : null) } }),
    'bohemian rhapsody',
  );
});

test('GET /commands exposes the last registration', async () => {
  const res = {
    status: 0,
    body: '',
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.body = String(body);
    },
  };
  await handleRequest({ url: '/commands' }, res);
  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.equal(typeof payload.ok, 'boolean');
  assert.ok(Array.isArray(payload.commands));
  assert.ok(Array.isArray(payload.guilds));
});
