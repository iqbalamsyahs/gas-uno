import { describe, expect, it } from 'vitest';
import { displayUser } from './discord-user';

describe('displayUser', () => {
  it('memakai global_name dan avatar user', () => {
    expect(displayUser({ id: '80351110224678912', username: 'nelly', global_name: 'Nelly', avatar: 'abc123' })).toEqual({
      name: 'Nelly',
      avatarUrl: 'https://cdn.discordapp.com/avatars/80351110224678912/abc123.png?size=128',
    });
  });

  it('tanpa global_name: pakai username', () => {
    expect(displayUser({ id: '80351110224678912', username: 'nelly', global_name: null, avatar: 'abc123' }).name).toBe('nelly');
  });

  it('tanpa avatar: pakai avatar default Discord', () => {
    // (80351110224678912 >> 22) % 6 = 5
    expect(displayUser({ id: '80351110224678912', username: 'nelly', avatar: null }).avatarUrl).toBe(
      'https://cdn.discordapp.com/embed/avatars/5.png',
    );
  });
});
