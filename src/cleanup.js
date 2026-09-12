const PANEL_CUSTOM_IDS = new Set([
  'spotify_prev',
  'spotify_playpause',
  'spotify_next',
  'spotify_leave',
  'nox_voldown',
  'nox_volup',
  'nox_save',
  'nox_shuffle',
  'nox_clip',
  'nox_suggest',
]);

function messageCustomIds(message) {
  const rows = message.components || [];
  return rows.flatMap((row) => (row.components || []).map((item) => item.customId || item.data?.custom_id));
}

function isStaleBotMessage(message, { keepId, botId } = {}) {
  if (!message || message.id === keepId) {
    return false;
  }
  if (botId && message.author?.id && message.author.id !== botId) {
    return false;
  }

  const customIds = messageCustomIds(message);
  if (customIds.some((id) => PANEL_CUSTOM_IDS.has(id))) {
    return true;
  }

  const hasEmbed = Boolean(message.embeds?.length);
  if (!message.content && !hasEmbed && !customIds.length) {
    return true;
  }

  const embed = message.embeds?.[0];
  const embedText = [embed?.title, embed?.author?.name, embed?.footer?.text, embed?.description]
    .filter(Boolean)
    .join(' ');
  const text = `${message.content || ''} ${embedText}`;
  return /está pensando|a tocar|em pausa|ficou na fila|noxmusic|usa `?\/play/i.test(text);
}

async function deleteStaleBotMessages(channel, { keepId, botId, limit = 30 } = {}) {
  if (!channel?.messages?.fetch) {
    return 0;
  }

  const fetched = await channel.messages.fetch({ limit }).catch(() => null);
  if (!fetched) {
    return 0;
  }

  let deleted = 0;
  for (const message of fetched.values()) {
    if (!isStaleBotMessage(message, { keepId, botId })) {
      continue;
    }
    try {
      await message.delete();
      deleted += 1;
    } catch (_) {
      // Missing permission or already gone
    }
  }
  return deleted;
}

module.exports = {
  PANEL_CUSTOM_IDS,
  isStaleBotMessage,
  deleteStaleBotMessages,
};
