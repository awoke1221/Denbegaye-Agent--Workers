"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cn = cn;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
/**
 * Combines class names using clsx and tailwind-merge for conditional styling.
 * This utility merges Tailwind CSS classes efficiently, handling conflicts and duplicates.
 *
 * @param inputs - Variable number of class values (strings, objects, arrays)
 * @returns Merged and deduplicated class string
 *
 * @example
 * ```ts
 * cn('bg-red-500', 'text-white', { 'font-bold': true })
 * // Returns: 'bg-red-500 text-white font-bold'
 * ```
 */
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
