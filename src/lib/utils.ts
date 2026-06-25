import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind-aware conflict resolution.
 *
 * Combines clsx (conditional class composition) with tailwind-merge (later
 * Tailwind utilities win over earlier conflicting ones). This is the standard
 * shadcn/ui `cn` helper used across all components.
 *
 * @param inputs - Class values (strings, arrays, or conditional objects).
 * @returns The merged, de-conflicted className string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
