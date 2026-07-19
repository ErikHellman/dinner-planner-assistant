/** Swedish activity labels for tool wire events, shown in the chat thinking bubble. */
const LABELS: Record<string, string> = {
	willys_search: 'Söker i Willys sortiment…',
	willys_product: 'Hämtar produktinfo…',
	willys_cart_view: 'Kollar varukorgen…',
	willys_cart_add: 'Lägger i varukorgen…',
	willys_cart_remove: 'Tar bort ur varukorgen…',
	willys_cart_clear: 'Tömmer varukorgen…',
	recipe_search: 'Söker recept…',
	recipe_get: 'Hämtar recept…',
	recipe_ingredients: 'Hämtar ingredienser…',
	recipe_aggregate: 'Bygger inköpslista…',
	plan_record_cart: 'Sparar veckans plan…',
	plan_get: 'Hämtar veckans plan…'
};

export function activityLabel(toolName: string): string {
	return LABELS[toolName] ?? 'Arbetar…';
}
