/**
 * Element symbols and names by atomic number.
 *
 * Z here sets the nuclear charge of a *hydrogen-like* atom — one electron bound
 * to a charge-Z nucleus. Picking carbon does not draw carbon's orbitals; it
 * draws C(5+), a single electron around a carbon nucleus, which is the only case
 * the Schrodinger equation solves exactly. The element name is a label for the
 * nucleus, not a claim about a neutral atom.
 */
export interface Element {
    atomicNumber: number;
    symbol: string;
    name: string;
}

// index = Z - 1
const ELEMENT_DATA: Array<[string, string]> = [
    ['H', 'Hydrogen'], ['He', 'Helium'], ['Li', 'Lithium'], ['Be', 'Beryllium'],
    ['B', 'Boron'], ['C', 'Carbon'], ['N', 'Nitrogen'], ['O', 'Oxygen'],
    ['F', 'Fluorine'], ['Ne', 'Neon'], ['Na', 'Sodium'], ['Mg', 'Magnesium'],
    ['Al', 'Aluminium'], ['Si', 'Silicon'], ['P', 'Phosphorus'], ['S', 'Sulfur'],
    ['Cl', 'Chlorine'], ['Ar', 'Argon'], ['K', 'Potassium'], ['Ca', 'Calcium'],
    ['Sc', 'Scandium'], ['Ti', 'Titanium'], ['V', 'Vanadium'], ['Cr', 'Chromium'],
    ['Mn', 'Manganese'], ['Fe', 'Iron'], ['Co', 'Cobalt'], ['Ni', 'Nickel'],
    ['Cu', 'Copper'], ['Zn', 'Zinc'], ['Ga', 'Gallium'], ['Ge', 'Germanium'],
    ['As', 'Arsenic'], ['Se', 'Selenium'], ['Br', 'Bromine'], ['Kr', 'Krypton'],
    ['Rb', 'Rubidium'], ['Sr', 'Strontium'], ['Y', 'Yttrium'], ['Zr', 'Zirconium'],
    ['Nb', 'Niobium'], ['Mo', 'Molybdenum'], ['Tc', 'Technetium'], ['Ru', 'Ruthenium'],
    ['Rh', 'Rhodium'], ['Pd', 'Palladium'], ['Ag', 'Silver'], ['Cd', 'Cadmium'],
    ['In', 'Indium'], ['Sn', 'Tin'], ['Sb', 'Antimony'], ['Te', 'Tellurium'],
    ['I', 'Iodine'], ['Xe', 'Xenon'], ['Cs', 'Caesium'], ['Ba', 'Barium'],
    ['La', 'Lanthanum'], ['Ce', 'Cerium'], ['Pr', 'Praseodymium'], ['Nd', 'Neodymium'],
    ['Pm', 'Promethium'], ['Sm', 'Samarium'], ['Eu', 'Europium'], ['Gd', 'Gadolinium'],
    ['Tb', 'Terbium'], ['Dy', 'Dysprosium'], ['Ho', 'Holmium'], ['Er', 'Erbium'],
    ['Tm', 'Thulium'], ['Yb', 'Ytterbium'], ['Lu', 'Lutetium'], ['Hf', 'Hafnium'],
    ['Ta', 'Tantalum'], ['W', 'Tungsten'], ['Re', 'Rhenium'], ['Os', 'Osmium'],
    ['Ir', 'Iridium'], ['Pt', 'Platinum'], ['Au', 'Gold'], ['Hg', 'Mercury'],
    ['Tl', 'Thallium'], ['Pb', 'Lead'], ['Bi', 'Bismuth'], ['Po', 'Polonium'],
    ['At', 'Astatine'], ['Rn', 'Radon'], ['Fr', 'Francium'], ['Ra', 'Radium'],
    ['Ac', 'Actinium'], ['Th', 'Thorium'], ['Pa', 'Protactinium'], ['U', 'Uranium'],
    ['Np', 'Neptunium'], ['Pu', 'Plutonium'], ['Am', 'Americium'], ['Cm', 'Curium'],
    ['Bk', 'Berkelium'], ['Cf', 'Californium'], ['Es', 'Einsteinium'], ['Fm', 'Fermium'],
    ['Md', 'Mendelevium'], ['No', 'Nobelium'], ['Lr', 'Lawrencium'], ['Rf', 'Rutherfordium'],
    ['Db', 'Dubnium'], ['Sg', 'Seaborgium'], ['Bh', 'Bohrium'], ['Hs', 'Hassium'],
    ['Mt', 'Meitnerium'], ['Ds', 'Darmstadtium'], ['Rg', 'Roentgenium'], ['Cn', 'Copernicium'],
    ['Nh', 'Nihonium'], ['Fl', 'Flerovium'], ['Mc', 'Moscovium'], ['Lv', 'Livermorium'],
    ['Ts', 'Tennessine'], ['Og', 'Oganesson'],
];

export const ELEMENTS: Element[] = ELEMENT_DATA.map(([symbol, name], index) => ({
    atomicNumber: index + 1,
    symbol,
    name,
}));

export const MIN_ATOMIC_NUMBER = 1;
export const MAX_ATOMIC_NUMBER = ELEMENTS.length;

export function elementFor(atomicNumber: number): Element | null {
    return ELEMENTS[atomicNumber - 1] ?? null;
}

/** e.g. "6 — C (Carbon)" */
export function elementLabel(atomicNumber: number): string {
    const element = elementFor(atomicNumber);
    return element
        ? `${element.atomicNumber} — ${element.symbol} (${element.name})`
        : String(atomicNumber);
}
