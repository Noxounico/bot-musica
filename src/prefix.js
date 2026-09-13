const PREFIX = '!';
const PREFIXES = ['!'];

function hint(command) {
  return `${PREFIX}${command}`;
}

function normalizeChatContent(content) {
  if (typeof content !== 'string') {
    return '';
  }

  return content
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/！/g, '!')
    .replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '');
}

function parsePrefixCommand(content) {
  if (typeof content !== 'string') {
    return null;
  }

  const normalized = normalizeChatContent(content);
  const prefix = PREFIXES.find((item) => normalized.startsWith(item));
  if (!prefix) {
    return null;
  }

  const rest = normalized.slice(prefix.length).trim();
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
  const original = normalizeChatContent(content);
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
  normalizeChatContent,
  parsePrefixCommand,
  parsePlaylistArgs,
  parseChatCommand,
};
