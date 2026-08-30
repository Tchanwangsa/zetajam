import { Globe, Lock } from '@lucide/svelte'

/**
 * Who can walk into a room, shared by both places that offer the switch — two
 * copies of a vocabulary is how one ends up saying what the other does not.
 */
export const VISIBILITY = [
  { value: true, label: 'public', icon: Globe },
  { value: false, label: 'private', icon: Lock },
]
