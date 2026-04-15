"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAvatarInitials = extractAvatarInitials;
exports.getUserDisplayName = getUserDisplayName;
function extractAvatarInitials(user) {
    const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.displayName?.trim();
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
function getUserDisplayName(user) {
    return (user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.displayName ||
        user?.email ||
        'User');
}
