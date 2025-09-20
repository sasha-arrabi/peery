export * from './user-media-stream.js';
export * from './webrtc.js';

/**
 * Get an element by its id.
 * @type { (id: string) => HTMLElement | null }
 */
export const $ = (id) => document.getElementById(id);
