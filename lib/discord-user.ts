export type User = { name: string; avatarUrl: string | null };

export const MOCK_USER: User = { name: 'Kamu', avatarUrl: null };

export type DiscordUser = { id: string; username: string; global_name?: string | null; avatar?: string | null };

// ponytail: nickname server butuh scope guilds.members.read; sekarang pakai global_name lalu username
export function displayUser(u: DiscordUser): User {
  const avatarUrl = u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> BigInt(22)) % BigInt(6))}.png`;
  return { name: u.global_name || u.username, avatarUrl };
}
