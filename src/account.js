function controllerFromMember(member) {
  const user = member?.user;
  const imageUrl = typeof member?.displayAvatarURL === 'function'
    ? member.displayAvatarURL({ size: 256 })
    : (typeof user?.displayAvatarURL === 'function'
      ? user.displayAvatarURL({ size: 256 })
      : null);

  return {
    id: member?.id || user?.id || null,
    displayName: member?.displayName || user?.username || 'NoxMusic',
    imageUrl: imageUrl || null,
  };
}

function mergeController(current, next) {
  if (!next) {
    return current || { id: null, displayName: 'NoxMusic', imageUrl: null };
  }
  return {
    id: next.id || current?.id || null,
    displayName: next.displayName || current?.displayName || 'NoxMusic',
    imageUrl: next.imageUrl || current?.imageUrl || null,
  };
}

module.exports = { controllerFromMember, mergeController };
