const PREFIXES = ['!', '/'];

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

module.exports = { PREFIXES, parsePrefixCommand };
