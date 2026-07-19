import { ChatStore } from './chat.svelte';

/**
 * Module-level singleton so the conversation, the in-flight stream and the
 * input draft survive tab navigation. Safe for this single-user app: all chat
 * data is fetched client-side, nothing user-specific is created during SSR.
 */
export const chat = new ChatStore();
