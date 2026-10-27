export interface FoodItemIndex {
  id: string;
  name: string;
  category: 'Popular Foods' | 'Snacks & Treats' | 'Drinks & Shakes' | 'Protein & Dairy' | 'Breakfast & Bakery' | 'Fruits & Veggies';
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  icon: string;
}

export const HUGE_FOOD_INDEX: FoodItemIndex[] = [
  // --- REAL EVERYDAY FOODS ---
  { id: 'm1', name: 'Grilled Chicken Breast', category: 'Popular Foods', portion: '1 breast (140g)', calories: 165, protein: 31, carbs: 0, fat: 3.6, icon: 'restaurant-outline' },
  { id: 'm2', name: 'Pan-Seared Salmon Fillet', category: 'Popular Foods', portion: '1 fillet (150g)', calories: 220, protein: 25, carbs: 0, fat: 13, icon: 'fish-outline' },
  { id: 'm3', name: 'Steamed Jasmine White Rice', category: 'Popular Foods', portion: '1 cup (160g)', calories: 205, protein: 4.2, carbs: 45, fat: 0.4, icon: 'nutrition-outline' },
  { id: 'm4', name: 'Steamed Brown Rice', category: 'Popular Foods', portion: '1 cup (190g)', calories: 215, protein: 5, carbs: 45, fat: 1.8, icon: 'nutrition-outline' },
  { id: 'm5', name: 'Sirloin Beef Steak', category: 'Popular Foods', portion: '1 steak (180g)', calories: 240, protein: 30, carbs: 0, fat: 13, icon: 'flame-outline' },
  { id: 'm6', name: 'Lean Ground Beef 90/10', category: 'Popular Foods', portion: '1 patty / serving (120g)', calories: 210, protein: 26, carbs: 0, fat: 11, icon: 'flame-outline' },
  { id: 'm7', name: 'Baked Sweet Potato', category: 'Popular Foods', portion: '1 medium (130g)', calories: 115, protein: 2, carbs: 27, fat: 0.2, icon: 'nutrition-outline' },
  { id: 'm8', name: 'Al Dente Pasta with Marinara', category: 'Popular Foods', portion: '1 cup (180g)', calories: 250, protein: 8, carbs: 48, fat: 3, icon: 'restaurant-outline' },
  { id: 'm9', name: 'Pepperoni Pizza Slice', category: 'Popular Foods', portion: '1 slice (110g)', calories: 290, protein: 12, carbs: 32, fat: 13, icon: 'pizza-outline' },
  { id: 'm10', name: 'Cheeseburger (Single Beef Patty)', category: 'Popular Foods', portion: '1 burger (180g)', calories: 430, protein: 24, carbs: 36, fat: 22, icon: 'fast-food-outline' },
  { id: 'm11', name: 'Crispy French Fries', category: 'Popular Foods', portion: '1 medium order (115g)', calories: 340, protein: 4, carbs: 44, fat: 16, icon: 'fast-food-outline' },
  { id: 'm12', name: 'Steamed Jumbo Shrimp', category: 'Popular Foods', portion: '8 shrimp (120g)', calories: 100, protein: 24, carbs: 0.2, fat: 0.5, icon: 'fish-outline' },
  { id: 'm13', name: 'Crispy Chicken Tenders', category: 'Popular Foods', portion: '3 tenders (130g)', calories: 330, protein: 22, carbs: 18, fat: 19, icon: 'restaurant-outline' },
  { id: 'm14', name: 'Steamed Broccoli Florets', category: 'Popular Foods', portion: '1 cup (120g)', calories: 45, protein: 3.5, carbs: 8, fat: 0.5, icon: 'leaf-outline' },
  { id: 'm15', name: 'Fluffy Cooked Quinoa', category: 'Popular Foods', portion: '1 cup (185g)', calories: 220, protein: 8, carbs: 39, fat: 3.5, icon: 'nutrition-outline' },
  { id: 'm16', name: 'Street Taco (Carne Asada / Chicken)', category: 'Popular Foods', portion: '1 taco (90g)', calories: 170, protein: 11, carbs: 16, fat: 7, icon: 'restaurant-outline' },
  { id: 'm17', name: 'Cheese Quesadilla', category: 'Popular Foods', portion: '1 quesadilla (150g)', calories: 410, protein: 18, carbs: 36, fat: 22, icon: 'restaurant-outline' },
  { id: 'm18', name: 'Canned Chunk Light Tuna in Water', category: 'Popular Foods', portion: '1 can (130g)', calories: 120, protein: 28, carbs: 0, fat: 1, icon: 'fish-outline' },
  { id: 'm19', name: 'Baked Cod / White Fish Fillet', category: 'Popular Foods', portion: '1 fillet (140g)', calories: 110, protein: 23, carbs: 0, fat: 1.5, icon: 'fish-outline' },
  { id: 'm20', name: 'Herb Roasted Baby Potatoes', category: 'Popular Foods', portion: '1 cup (150g)', calories: 140, protein: 3, carbs: 28, fat: 2.5, icon: 'nutrition-outline' },

  // --- PROTEIN & DAIRY ---
  { id: 'p1', name: 'Fairlife Core Power Elite 42g', category: 'Protein & Dairy', portion: '1 bottle (14 fl oz / 414ml)', calories: 230, protein: 42, carbs: 8, fat: 3.5, icon: 'barbell-outline' },
  { id: 'p2', name: '100% Whey Protein Scoop', category: 'Protein & Dairy', portion: '1 scoop (30g)', calories: 120, protein: 24, carbs: 3, fat: 1.5, icon: 'barbell-outline' },
  { id: 'p3', name: 'Greek Yogurt (Non-Fat Plain)', category: 'Protein & Dairy', portion: '1 cup (170g)', calories: 100, protein: 18, carbs: 6, fat: 0, icon: 'nutrition-outline' },
  { id: 'p4', name: 'Low-Fat Cottage Cheese', category: 'Protein & Dairy', portion: '1/2 cup (115g)', calories: 90, protein: 13, carbs: 4.5, fat: 2.5, icon: 'nutrition-outline' },
  { id: 'p5', name: 'Sharp Cheddar Cheese Slice', category: 'Protein & Dairy', portion: '1 slice (28g)', calories: 115, protein: 7, carbs: 0.5, fat: 9.5, icon: 'nutrition-outline' },
  { id: 'p6', name: 'String Mozzarella Cheese Stick', category: 'Protein & Dairy', portion: '1 stick (28g)', calories: 80, protein: 7, carbs: 1, fat: 6, icon: 'nutrition-outline' },
  { id: 'p7', name: 'Quest Protein Bar', category: 'Protein & Dairy', portion: '1 bar (60g)', calories: 200, protein: 21, carbs: 22, fat: 9, icon: 'fitness-outline' },
  { id: 'p8', name: 'Barebells Protein Bar', category: 'Protein & Dairy', portion: '1 bar (55g)', calories: 200, protein: 20, carbs: 20, fat: 7, icon: 'fitness-outline' },
  { id: 'p9', name: 'Jack Link’s Beef Jerky', category: 'Protein & Dairy', portion: '1 bag (28g / 1 oz)', calories: 80, protein: 11, carbs: 6, fat: 1.5, icon: 'flame-outline' },
  { id: 'p10', name: 'Chomps Grass-Fed Beef Stick', category: 'Protein & Dairy', portion: '1 stick (32g)', calories: 90, protein: 9, carbs: 0, fat: 6, icon: 'flame-outline' },
  { id: 'p11', name: 'Hard-Boiled Egg', category: 'Protein & Dairy', portion: '1 large egg (50g)', calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3, icon: 'egg-outline' },
  { id: 'p12', name: 'Egg Whites (Liquid / Scrambled)', category: 'Protein & Dairy', portion: '1/2 cup (120g)', calories: 60, protein: 13, carbs: 1, fat: 0.2, icon: 'egg-outline' },
  { id: 'p13', name: 'Pan-Seared Firm Tofu', category: 'Protein & Dairy', portion: '1 block (100g)', calories: 95, protein: 10, carbs: 2, fat: 5.5, icon: 'leaf-outline' },
  { id: 'p14', name: 'Steamed Edamame in Pods', category: 'Protein & Dairy', portion: '1/2 cup (80g)', calories: 120, protein: 11, carbs: 9, fat: 5, icon: 'leaf-outline' },

  // --- SNACKS & TREATS ---
  { id: 's1', name: 'SunChips (Garden Salsa / Cheddar)', category: 'Snacks & Treats', portion: '1 serving (28g / 15 chips)', calories: 140, protein: 2, carbs: 19, fat: 6, icon: 'leaf-outline' },
  { id: 's2', name: 'Doritos (Nacho Cheese / Cool Ranch)', category: 'Snacks & Treats', portion: '1 serving (28g / 12 chips)', calories: 150, protein: 2, carbs: 18, fat: 8, icon: 'fast-food-outline' },
  { id: 's3', name: 'Cheetos Crunchy Cheese Snacks', category: 'Snacks & Treats', portion: '1 serving (28g / 21 pieces)', calories: 160, protein: 2, carbs: 15, fat: 10, icon: 'fast-food-outline' },
  { id: 's4', name: 'Lay’s Classic Potato Chips', category: 'Snacks & Treats', portion: '1 serving (28g / 15 chips)', calories: 160, protein: 2, carbs: 15, fat: 10, icon: 'fast-food-outline' },
  { id: 's5', name: 'Pringles Original Potato Crisps', category: 'Snacks & Treats', portion: '1 serving (28g / 16 crisps)', calories: 150, protein: 1, carbs: 16, fat: 9, icon: 'fast-food-outline' },
  { id: 's6', name: 'Cheez-It Baked Snack Crackers', category: 'Snacks & Treats', portion: '1 serving (30g / 27 crackers)', calories: 150, protein: 3, carbs: 17, fat: 8, icon: 'pizza-outline' },
  { id: 's7', name: 'Goldfish Cheddar Crackers', category: 'Snacks & Treats', portion: '1 serving (30g / 55 pieces)', calories: 140, protein: 3, carbs: 20, fat: 5, icon: 'nutrition-outline' },
  { id: 's8', name: 'Smartfood White Cheddar Popcorn', category: 'Snacks & Treats', portion: '2.5 cups (28g)', calories: 160, protein: 3, carbs: 14, fat: 10, icon: 'sparkles-outline' },
  { id: 's9', name: 'Oreo Sandwich Cookies (3 cookies)', category: 'Snacks & Treats', portion: '3 cookies (34g)', calories: 160, protein: 1, carbs: 25, fat: 7, icon: 'heart-outline' },
  { id: 's10', name: 'Chips Ahoy! Chocolate Chip Cookies', category: 'Snacks & Treats', portion: '3 cookies (33g)', calories: 160, protein: 1, carbs: 22, fat: 8, icon: 'heart-outline' },
  { id: 's11', name: 'Snickers Candy Bar', category: 'Snacks & Treats', portion: '1 bar (52.7g)', calories: 250, protein: 4, carbs: 33, fat: 12, icon: 'nutrition-outline' },
  { id: 's12', name: 'Reese’s Peanut Butter Cups', category: 'Snacks & Treats', portion: '2 cups (42g)', calories: 210, protein: 5, carbs: 24, fat: 12, icon: 'nutrition-outline' },
  { id: 's13', name: 'Roasted Salted Almonds', category: 'Snacks & Treats', portion: '1/4 cup (28g)', calories: 160, protein: 6, carbs: 6, fat: 14, icon: 'nutrition-outline' },
  { id: 's14', name: 'Peanut Butter (Creamy / Crunchy)', category: 'Snacks & Treats', portion: '2 tbsp (32g)', calories: 190, protein: 8, carbs: 7, fat: 16, icon: 'nutrition-outline' },

  // --- DRINKS & SHAKES ---
  { id: 'd1', name: 'Cold Fresh Lemonade', category: 'Drinks & Shakes', portion: '1 glass (12 fl oz / 355ml)', calories: 120, protein: 0.2, carbs: 30, fat: 0.1, icon: 'water-outline' },
  { id: 'd2', name: 'Pure Water / Sparkling Water', category: 'Drinks & Shakes', portion: '1 bottle (16.9 fl oz)', calories: 0, protein: 0, carbs: 0, fat: 0, icon: 'water-outline' },
  { id: 'd3', name: 'Monster Energy Zero Sugar', category: 'Drinks & Shakes', portion: '1 can (16 fl oz / 473ml)', calories: 10, protein: 0, carbs: 2, fat: 0, icon: 'flash-outline' },
  { id: 'd4', name: 'Red Bull Energy Drink', category: 'Drinks & Shakes', portion: '1 can (8.4 fl oz / 250ml)', calories: 110, protein: 1, carbs: 27, fat: 0, icon: 'flash-outline' },
  { id: 'd5', name: 'Celsius Live Fit Energy', category: 'Drinks & Shakes', portion: '1 can (12 fl oz)', calories: 10, protein: 0, carbs: 0, fat: 0, icon: 'flash-outline' },
  { id: 'd6', name: 'Gatorade / Electrolyte Sports Drink', category: 'Drinks & Shakes', portion: '1 bottle (12 fl oz)', calories: 80, protein: 0, carbs: 22, fat: 0, icon: 'water-outline' },
  { id: 'd7', name: 'Coca-Cola Original', category: 'Drinks & Shakes', portion: '1 can (12 fl oz)', calories: 140, protein: 0, carbs: 39, fat: 0, icon: 'cafe-outline' },
  { id: 'd8', name: 'Diet Coke / Coke Zero Sugar', category: 'Drinks & Shakes', portion: '1 can (12 fl oz)', calories: 0, protein: 0, carbs: 0, fat: 0, icon: 'cafe-outline' },
  { id: 'd9', name: 'Whole Milk (8 fl oz)', category: 'Drinks & Shakes', portion: '1 cup (240ml)', calories: 150, protein: 8, carbs: 12, fat: 8, icon: 'water-outline' },
  { id: 'd10', name: 'Black Coffee / Espresso', category: 'Drinks & Shakes', portion: '1 cup (240ml)', calories: 2, protein: 0.3, carbs: 0, fat: 0, icon: 'cafe-outline' },
  { id: 'd11', name: 'Iced Caffe Latte (2% Milk)', category: 'Drinks & Shakes', portion: '1 medium (16 fl oz)', calories: 130, protein: 9, carbs: 13, fat: 4.5, icon: 'cafe-outline' },
  { id: 'd12', name: 'Whey Protein Shake with Milk', category: 'Drinks & Shakes', portion: '1 shaker (450ml)', calories: 270, protein: 32, carbs: 15, fat: 9, icon: 'barbell-outline' },

  // --- BREAKFAST & BAKERY ---
  { id: 'b1', name: 'Scrambled Eggs (2 eggs)', category: 'Breakfast & Bakery', portion: '2 large eggs (110g)', calories: 180, protein: 13, carbs: 1.5, fat: 14, icon: 'sunny-outline' },
  { id: 'b2', name: 'Sunny Side Up Fried Egg', category: 'Breakfast & Bakery', portion: '1 egg (50g)', calories: 90, protein: 6.5, carbs: 0.4, fat: 7, icon: 'sunny-outline' },
  { id: 'b3', name: 'Toasted Whole Wheat Bread (1 slice)', category: 'Breakfast & Bakery', portion: '1 slice (35g)', calories: 80, protein: 4, carbs: 14, fat: 1, icon: 'restaurant-outline' },
  { id: 'b4', name: 'Crispy Smoked Bacon Strips (3 strips)', category: 'Breakfast & Bakery', portion: '3 strips (45g)', calories: 130, protein: 9, carbs: 0.4, fat: 10, icon: 'flame-outline' },
  { id: 'b5', name: 'Pork Breakfast Sausage Links (2 links)', category: 'Breakfast & Bakery', portion: '2 links (70g)', calories: 180, protein: 11, carbs: 1, fat: 15, icon: 'flame-outline' },
  { id: 'b6', name: 'Rolled Oatmeal with Blueberries', category: 'Breakfast & Bakery', portion: '1 bowl (240g cooked)', calories: 220, protein: 7, carbs: 42, fat: 3.5, icon: 'cafe-outline' },
  { id: 'b7', name: 'Toasted Bagel with Cream Cheese', category: 'Breakfast & Bakery', portion: '1 whole bagel (150g)', calories: 410, protein: 12, carbs: 64, fat: 12, icon: 'nutrition-outline' },
  { id: 'b8', name: 'Avocado Toast with 1 Poached Egg', category: 'Breakfast & Bakery', portion: '1 slice (130g)', calories: 240, protein: 10, carbs: 19, fat: 14, icon: 'leaf-outline' },
  { id: 'b9', name: 'Buttermilk Pancakes with Syrup', category: 'Breakfast & Bakery', portion: '2 pancakes (160g)', calories: 380, protein: 8, carbs: 68, fat: 9, icon: 'sunny-outline' },
  { id: 'b10', name: 'Flaky Butter Croissant', category: 'Breakfast & Bakery', portion: '1 croissant (67g)', calories: 270, protein: 5, carbs: 31, fat: 14, icon: 'restaurant-outline' },

  // --- FRUITS & VEGGIES ---
  { id: 'f1', name: 'Fresh Yellow Banana', category: 'Fruits & Veggies', portion: '1 medium (118g)', calories: 105, protein: 1.3, carbs: 27, fat: 0.3, icon: 'leaf-outline' },
  { id: 'f2', name: 'Crisp Honeycrisp / Red Apple', category: 'Fruits & Veggies', portion: '1 apple (180g)', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, icon: 'leaf-outline' },
  { id: 'f3', name: 'Fresh Ripe Strawberries', category: 'Fruits & Veggies', portion: '1 cup (140g)', calories: 45, protein: 1, carbs: 11, fat: 0.4, icon: 'leaf-outline' },
  { id: 'f4', name: 'Wild Blueberries', category: 'Fruits & Veggies', portion: '1 cup (150g)', calories: 80, protein: 1, carbs: 21, fat: 0.5, icon: 'leaf-outline' },
  { id: 'f5', name: 'Fresh Sliced Avocado', category: 'Fruits & Veggies', portion: '1/2 avocado (100g)', calories: 160, protein: 2, carbs: 8.5, fat: 15, icon: 'nutrition-outline' },
  { id: 'f6', name: 'Fresh Baby Spinach Leaves', category: 'Fruits & Veggies', portion: '2 cups (60g)', calories: 20, protein: 2.5, carbs: 3, fat: 0.3, icon: 'leaf-outline' },
  { id: 'f7', name: 'Crisp Sliced Cucumber', category: 'Fruits & Veggies', portion: '1 cup (100g)', calories: 16, protein: 0.7, carbs: 3.6, fat: 0.1, icon: 'leaf-outline' },
  { id: 'f8', name: 'Vine-Ripened Sliced Tomato', category: 'Fruits & Veggies', portion: '1 medium (120g)', calories: 25, protein: 1.2, carbs: 5, fat: 0.2, icon: 'leaf-outline' },
  { id: 'f9', name: 'Sweet Baby Carrots', category: 'Fruits & Veggies', portion: '1 cup (110g)', calories: 40, protein: 1, carbs: 9.5, fat: 0.2, icon: 'leaf-outline' },
  { id: 'f10', name: 'Sweet Golden Corn', category: 'Fruits & Veggies', portion: '1/2 cup (80g)', calories: 90, protein: 3, carbs: 19, fat: 1.2, icon: 'leaf-outline' },
];
