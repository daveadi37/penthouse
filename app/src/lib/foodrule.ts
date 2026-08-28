import type { DateStr, Meal, Settings } from '@/types';

/* ============================================================
   The food rule, enforced rather than merely printed.

   FOOD RULE — THIS IS NOT OPTIONAL. All food is vegetarian for the
   whole observance. No meat. No fish. No eggs. Milk, cheese, yoghurt
   and butter are fine. Onion and garlic are fine.

   It is on the top of every sheet in capitals, and it is still the
   thing most likely to go wrong on a tired Thursday when somebody
   plans next week's menu out of habit. So the app reads the menu and
   says so, rather than trusting that everyone read the header.

   The list below is deliberately blunt and deliberately over-eager.
   A false positive costs somebody five seconds of reading; a false
   negative puts meat in that kitchen.
   ============================================================ */

const BANNED: [RegExp, string][] = [
  [/\b(chicken|murgh)\b/i, 'chicken'],
  [/\b(lamb|mutton|gosht)\b/i, 'lamb'],
  [/\b(beef|steak|veal)\b/i, 'beef'],
  [/\b(pork|bacon|ham|gammon|sausage|chorizo|pepperoni|salami)\b/i, 'pork'],
  [/\b(duck|turkey|quail)\b/i, 'poultry'],
  [/\b(fish|sea ?bass|salmon|tuna|cod|hamour|sardine|anchovy|prawn|shrimp|crab|lobster|squid|calamari|shellfish)\b/i, 'fish or shellfish'],
  [/\b(egg|eggs|omelette|shakshuka|mayonnaise|meringue)\b/i, 'egg'],
  [/\b(mince|meat|keema|kofta|kebab|biltong|stock cube|gelatin(e)?)\b/i, 'meat'],
];

export interface FoodRuleBreach {
  where: string;
  what: string;
}

/** Everything in this meal that the food rule forbids. Empty is good. */
export function foodRuleBreaches(meal: Pick<Meal, 'name' | 'ingredients' | 'prep' | 'cook' | 'diet'>): FoodRuleBreach[] {
  const out: FoodRuleBreach[] = [];
  const check = (text: string, where: string) => {
    if (!text) return;
    BANNED.forEach(([re, what]) => {
      if (re.test(text) && !out.some((b) => b.where === where && b.what === what)) {
        out.push({ where, what });
      }
    });
  };
  check(meal.name, 'the dish');
  meal.ingredients.forEach((i) => check(i.name, `the ingredient “${i.name}”`));
  check(meal.prep, 'the prep note');
  check(meal.cook, 'the cooking note');
  return out;
}

/** Is this date inside the observance the food rule belongs to? */
export function underFoodRule(settings: Settings, date: DateStr): boolean {
  const w = settings.observanceWindow;
  return !!w && date >= w.from && date <= w.to;
}

/**
 * Reads out what is wrong. Deduplicated by what rather than by where —
 * "chicken in the dish and chicken in the ingredient Chicken" is two
 * sentences saying one thing, and the person reading it at 19:00 needs
 * the one thing.
 */
export function breachSentence(breaches: FoodRuleBreach[]): string {
  const what = [...new Set(breaches.map((b) => b.what))];
  if (!what.length) return '';
  const last = what.pop()!;
  return what.length ? `${what.join(', ')} and ${last}` : last;
}
