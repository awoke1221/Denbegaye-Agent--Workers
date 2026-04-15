export interface AvatarUser {
  displayName?: string | null;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
  };
}

export function extractAvatarInitials(user?: AvatarUser): string {
  const displayName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.displayName?.trim();

  if (displayName) {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return parts
      .slice(0, 2)
      .map(p => p[0])
      .join('')
      .toUpperCase();
  }

  if (user?.email) {
    const local = user.email.split('@')[0];
    return local.slice(0, 2).toUpperCase() || '?';
  }

  return '?';
}

export function getUserDisplayName(user?: AvatarUser): string {
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.displayName ||
    user?.email ||
    'User'
  );
}
