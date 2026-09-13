const HINT_COOLDOWN_MS = 2 * 60 * 1000;

function chatLooksEmpty(content) {
  return !String(content || '').trim();
}

function shouldHintUnreadableChat({
  content,
  authorInVoice = false,
  authorChannelId = null,
  botChannelId = null,
  inPanelChannel = false,
  lastHintAt = 0,
  now = Date.now(),
  cooldownMs = HINT_COOLDOWN_MS,
} = {}) {
  if (!chatLooksEmpty(content)) {
    return false;
  }
  if (lastHintAt && now - lastHintAt < cooldownMs) {
    return false;
  }

  if (inPanelChannel) {
    return true;
  }

  return Boolean(authorInVoice && authorChannelId);
}

function emptyChatHint({ botId, queryExample = 'mtg ficar legal' } = {}) {
  const mention = botId
    ? `<@${botId}> play ${queryExample}`
    : `@NoxMusic play ${queryExample}`;
  return [
    'Não consigo ler `!play` neste chat — o Discord esconde o texto.',
    `Clica **Tocar** no painel ou escreve \`${mention}\`.`,
  ].join('\n');
}

function pickVoiceMember(userId, guilds = [], preferredGuildId = null) {
  const ordered = [...guilds];
  if (preferredGuildId) {
    ordered.sort((left, right) => (
      Number(right.id === preferredGuildId) - Number(left.id === preferredGuildId)
    ));
  }

  for (const guild of ordered) {
    const state = guild.voiceStates?.cache?.get?.(userId)
      || guild.voiceStates?.get?.(userId);
    const member = state?.member || guild.members?.cache?.get?.(userId);
    const channel = state?.channel || member?.voice?.channel;
    if (member && channel) {
      return member;
    }
  }

  return null;
}

module.exports = {
  HINT_COOLDOWN_MS,
  chatLooksEmpty,
  shouldHintUnreadableChat,
  emptyChatHint,
  pickVoiceMember,
};
