/** Lowercase and strip diacritics: "Kalorisnål" -> "kalorisnal".
 * Client-safe copy of foldText from $lib/server/recipes/normalize (that module
 * is server-only and cannot be value-imported here); keep the two in sync. */
export function foldText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}
