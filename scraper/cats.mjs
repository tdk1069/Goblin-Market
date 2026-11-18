// AH category ids (the server's item_basic.aH values), copied from the addon's CAT_TREE.
export const CAT_TREE = [
  ['Weapons', [['Hand-to-Hand', 1], ['Daggers', 2], ['Swords', 3], ['Great Swords', 4], ['Axes', 5],
    ['Great Axes', 6], ['Scythes', 7], ['Polearms', 8], ['Katana', 9], ['Great Katana', 10],
    ['Clubs', 11], ['Staves', 12], ['Ranged', 13], ['Instruments', 14]]],
  ['Ammo & Misc', [['Ammunition', 15], ['Fishing Gear', 47], ['Pet Items', 48], ['Grips', 62]]],
  ['Armor', [['Shields', 16], ['Head', 17], ['Body', 18], ['Hands', 19], ['Legs', 20], ['Feet', 21],
    ['Neck', 22], ['Waist', 23], ['Earrings', 24], ['Rings', 25], ['Back', 26]]],
  ['Scrolls', [['White Magic', 28], ['Black Magic', 29], ['Summoning', 30], ['Ninjutsu', 31],
    ['Songs', 32], ['Geomancy', 45], ['Dice', 60]]],
  ['Medicines & More', [['Medicines', 33], ['Furnishings', 34], ['Crystals', 35]]],
  ['Materials', [['Smithing', 38], ['Goldsmithing', 39], ['Clothcraft', 40], ['Leathercraft', 41],
    ['Bonecraft', 42], ['Woodworking', 43], ['Alchemy', 44], ['Alchemy 2', 63]]],
  ['Food', [['Fish', 51], ['Meat & Eggs', 52], ['Seafood', 53], ['Vegetables', 54], ['Soups', 55],
    ['Breads & Rice', 56], ['Sweets', 57], ['Drinks', 58], ['Ingredients', 59]]],
  ['Others', [['Cards', 36], ['Cursed Items', 37], ['Misc.', 46], ['Ninja Tools', 49],
    ['Beast-made', 50], ['Automaton', 61], ['Misc. 2', 64], ['Misc. 3', 65]]],
];

export const CAT_IDS = CAT_TREE.flatMap(([, cs]) => cs.map(([, id]) => id)).sort((a, b) => a - b);

// For the website: [{ group, cats: [{id, name}] }]
export const catsForSite = () =>
  CAT_TREE.map(([group, cs]) => ({ group, cats: cs.map(([name, id]) => ({ id, name })) }));
