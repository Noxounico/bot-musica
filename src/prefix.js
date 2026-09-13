const PREFIX = '!';
const PREFIXES = ['!', '/'];

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

module.exports = { PREFIX, PREFIXES, hint, parsePrefixCommand, parsePlaylistArgs };
