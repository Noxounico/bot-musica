const PREFIX = '!';
const PREFIXES = ['!'];

function hint(command) {
  return `${PREFIX}${command}`;
}

function parsePrefixCommand(content) {
  if (typeof content !== 'string') {
    return null;
  }

  const prefix = PREFIXES.find((item) => content.startsWith(item));
  if (!prefix) {
    return null;
  }

  const rest = content.slice(prefix.length).trim();
  if (!rest) {
    return null;
  }

  const space = rest.search(/\s+/);
  if (space === -1) {
    return { name: rest.toLowerCase(), args: '' };
  }

  return {
    name: rest.slice(0, space).toLowerCase(),
    args: rest.slice(space).trim(),
  };
}

function parsePlaylistArgs(args) {
  const text = String(args || '').trim();
  if (!text) {
    return { sub: 'lista', name: null, query: null };
  }

  const matched = text.match(/^(criar|add|tocar|lista)\s*(.*)$/i);
  if (!matched) {
    return { sub: 'lista', name: null, query: null };
  }

  const sub = matched[1].toLowerCase();
  const rest = matched[2].trim();
  if (sub === 'add') {
    const space = rest.search(/\s+/);
    if (space === -1) {
      return { sub, name: rest || null, query: null };
    }
    return {
      sub,
      name: rest.slice(0, space),
      query: rest.slice(space).trim() || null,
    };
  }

  return { sub, name: rest || null, query: null };
}

function parseChatCommand(content, { botId, commandNames = [] } = {}) {
  const original = String(content || '').trim();
  if (!original) {
    return null;
  }

  const mentionRe = botId ? new RegExp(`^<@!?${botId}>\\s*`) : null;
  let mentioned = false;
  let rest = original;
  if (mentionRe && mentionRe.test(rest)) {
    mentioned = true;
    rest = rest.replace(mentionRe, '').trim();
  }

  const prefixed = parsePrefixCommand(rest);
  if (prefixed && (!commandNames.length || commandNames.includes(prefixed.name))) {
    return prefixed;
  }

  if (!mentioned || !rest) {
    return null;
  }

  const space = rest.search(/\s+/);
  const first = (space === -1 ? rest : rest.slice(0, space)).toLowerCase();
  const args = space === -1 ? '' : rest.slice(space).trim();
  if (commandNames.includes(first)) {
    return { name: first, args };
  }

  return { name: 'play', args: rest };
}

module.exports = {
  PREFIX,
  PREFIXES,
  hint,
  parsePrefixCommand,
  parsePlaylistArgs,
  parseChatCommand,
};
