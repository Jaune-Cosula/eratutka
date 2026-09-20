/**
 * The palette used for a dog's collar colour on the map.
 *
 * Shared between the "add dog" form and the dog's settings dialog so the two can never
 * drift apart, and given names so the swatches are not colour-only controls — a hunter
 * who cannot separate two similar hues can still tell the dogs apart by name, and the
 * same text becomes the accessible label.
 */
export const DOG_COLOR_PALETTE: { value: string; label: string }[] = [
  { value: '#ef4444', label: 'Punainen' },
  { value: '#10b981', label: 'Vihreä' },
  { value: '#3b82f6', label: 'Sininen' },
  { value: '#f59e0b', label: 'Oranssi' },
  { value: '#a855f7', label: 'Violetti' },
  { value: '#ec4899', label: 'Pinkki' },
  { value: '#06b6d4', label: 'Turkoosi' },
];

/**
 * Colours worn by the other dogs in the hunt, so the settings dialog can flag a clash.
 * The dog's own colour is deliberately not filtered out of the result: the case worth
 * flagging is precisely "you and another dog are both wearing red".
 */
export function colorsUsedByOthers(others: { color?: string }[]): string[] {
  const used = new Set<string>();
  for (const other of others) {
    const value = String(other?.color || '').trim().toLowerCase();
    if (value) used.add(value);
  }
  return Array.from(used);
}
