import Constants from 'expo-constants';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const APP_SECRET = Constants.expoConfig?.extra?.appSecret || process.env.EXPO_PUBLIC_APP_SECRET || '';

export async function fetchAiMenu(placeId: string, websiteUri?: string, placeName?: string, cuisine?: string): Promise<string[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-ai-menus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-secret': APP_SECRET,
      },
      body: JSON.stringify({ placeId, websiteUri }),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) return data.items;
    } else {
      console.warn('[fetchAiMenu] Edge function error:', res.status);
    }
  } catch (error) {
    console.error('[fetchAiMenu] network or parsing error:', error);
  }

  return generateFallbackMenu(placeName || 'Restaurant', cuisine || 'restaurant');
}

function generateFallbackMenu(name: string, type: string): string[] {
  const t = type.toLowerCase();
  if (t.includes('pizza')) {
    return [
      "Margherita Napoletana - $18.00: San Marzano tomato sauce, fresh fior di latte mozzarella, basil, and extra virgin olive oil.",
      "Truffle & Wild Mushroom Pie - $22.00: Roasted wild mushrooms, garlic cream, fontina cheese, and white truffle oil.",
      "Garlic Butter Knots - $9.00: House-made dough baked golden brown and tossed with pecorino romano and fresh parsley."
    ];
  }
  if (t.includes('burger') || t.includes('american')) {
    return [
      "Signature Double Smash Burger - $16.00: Two crispy seared beef patties, American cheese, caramelized onions, and house sauce on brioche.",
      "Truffle Parmesan Shoestring Fries - $9.00: Crispy golden fries tossed in white truffle oil, aged parmesan, and fine sea salt.",
      "Buttermilk Fried Chicken Sandwich - $15.00: Crispy chicken breast, tangy slaw, house pickles, and spicy mayo on a toasted bun."
    ];
  }
  if (t.includes('taco') || t.includes('mexican')) {
    return [
      "Carne Asada Street Tacos - $14.00: Charred marinated skirt steak, diced onions, fresh cilantro, and salsa verde on corn tortillas.",
      "Fresh Guacamole & House Chips - $11.00: Smashed Hass avocados, serrano chiles, lime juice, cilantro, and warm tortilla chips.",
      "Al Pastor Quesadilla - $15.00: Spit-roasted marinated pork and melted Oaxaca cheese folded in a toasted flour tortilla."
    ];
  }
  if (t.includes('sushi') || t.includes('japanese')) {
    return [
      "Spicy Tuna Crunch Roll - $16.00: Fresh yellowfin tuna, spicy aioli, scallions, and toasted tempura flakes.",
      "Truffle Salmon Nigiri - $14.00: Seared Atlantic salmon belly topped with black truffle purée and sweet soy glaze.",
      "Crispy Pork Gyoza - $10.00: Five pan-seared handmade dumplings served with a citrus ponzu dipping sauce."
    ];
  }
  if (t.includes('italian') || t.includes('pasta')) {
    return [
      "Rigatoni Alla Vodka - $24.00: Al dente bronze-cut rigatoni in a velvety tomato cream sauce with crispy pancetta.",
      "Chicken Parmigiana - $26.00: Crispy breaded cutlet smothered in san marzano marinara and fresh melted mozzarella.",
      "Creamy Burrata Caprese - $16.00: Imported pugliese burrata, heirloom tomatoes, fresh basil pesto, and balsamic glaze."
    ];
  }
  return [
    "Chef's Signature Special - $24.00: House favorite preparation crafted daily with fresh seasonal ingredients and bold flavors.",
    "Crispy Calamari - $15.00: Flash-fried tender squid rings and tentacles served with spicy marinara and lemon aioli.",
    "Chopped House Salad - $12.00: Crisp mixed greens, cherry tomatoes, cucumbers, toasted almonds, and balsamic vinaigrette."
  ];
}
