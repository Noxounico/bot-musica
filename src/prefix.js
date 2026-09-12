const PREFIXES = ['!', '/'];

function parsePrefixCommand(content) {
  if (typeof content !== 'string') {
    return null;
  }

  const prefix = PREFIXES.find((item) => content.startsWith(item));
  if (!prefix) {
    return null;
  }

  const [name] = content.slice(prefix.length).trim().split(/\s+/);
  return name ? name.toLowerCase() : null;
}

module.exports = { PREFIXES, parsePrefixCommand };
