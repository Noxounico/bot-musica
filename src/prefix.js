const PREFIX = '!';

function parsePrefixCommand(content) {
  if (typeof content !== 'string' || !content.startsWith(PREFIX)) {
    return null;
  }

  const [name] = content.slice(PREFIX.length).trim().split(/\s+/);
  return name ? name.toLowerCase() : null;
}

module.exports = { PREFIX, parsePrefixCommand };
