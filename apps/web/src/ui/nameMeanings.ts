// Meanings of the Turkish place names for English-language players (CLAUDE.md §11 Dil). The names themselves stay
// Turkish for everyone (the lobby is shared); this only glosses them.

// Whole names: the crown capitals (game/cities.ts) and the inns' places (game/innInfo.ts).
const EXACT: Record<string, string> = {
  // Capitals.
  'Altınkapı': 'Golden Gate', 'Sedefhisar': 'Nacre Fortress', 'Gümüşsu': 'Silver Water', 'Kervankale': 'Caravan Castle',
  'Yıldızlıhan': 'Starry Inn', 'Akkale': 'White Castle', 'Mermerli': 'Marble Town', 'Lalezar': 'Tulip Garden',
  'Bakırköprü': 'Copper Bridge', 'Safranbolu': 'Saffron City', 'Mercankale': 'Coral Castle', 'Gülşehir': 'Rose City',
  'Firuzehisar': 'Turquoise Fortress', 'Tunçkapı': 'Bronze Gate', 'Sarıkemer': 'Yellow Arch',
  'Sarayburnu': 'Palace Point', 'Çinikale': 'Tile Castle', 'İpekhan': 'Silk Inn', 'Gökkubbe': 'Sky Dome',
  'Demirkapı': 'Iron Gate',
  // Inn places.
  'Akçay': 'White Stream', 'Karapınar': 'Black Spring', 'Yeşilova': 'Green Plain', 'Kızılkaya': 'Red Rock',
  'Değirmendere': 'Mill Brook', 'Taşköprü': 'Stone Bridge', 'Söğütlü': 'Willow Grove', 'Çamlıbel': 'Pine Pass',
  'Kuyucak': 'Little Well', 'Eskiyol': 'Old Road', 'Gökdere': 'Blue Brook', 'Ilıca': 'Hot Spring',
  'Narlı': 'Pomegranate Grove', 'Bozkır': 'Grey Steppe', 'Sarıgöl': 'Yellow Lake', 'Kavaklı': 'Poplar Grove',
  'Çınaraltı': 'Under the Plane Tree', 'Ayazma': 'Holy Spring', 'Kurtbeli': 'Wolf Pass', 'Dumanlı': 'Misty Hollow',
  'Kervanyolu': 'Caravan Road', 'Ulupınar': 'Great Spring', 'Yelkaya': 'Wind Rock', 'Ardıçlı': 'Juniper Grove',
  'Saraçlı': 'Saddlers\' Row', 'Kemerli': 'Arched Bridge', 'Güvercinlik': 'Dovecote', 'Boğazağzı': 'Gorge Mouth',
  'Akpınar': 'White Spring', 'Karaağaç': 'Elm Tree', 'Çamlıca': 'Pine Hill', 'Taşlıyurt': 'Stony Homestead',
  'Yenice': 'Newtown', 'Eskikale': 'Old Castle', 'Kuyulu': 'Place of Wells', 'Sazlıdere': 'Reedy Brook',
  'Bozdağ': 'Grey Mountain', 'Gökçeova': 'Bluish Plain', 'Çeşmeli': 'Place of Fountains', 'Kayalı': 'Rocky Place',
  'Sarıyar': 'Yellow Cliff', 'Değirmenli': 'Place of Mills', 'Pınarbaşı': 'Springhead', 'Ortaköy': 'Middle Village',
  'Köprübaşı': 'Bridgehead', 'Dereboyu': 'Brookside', 'Yaylacık': 'Little Highland', 'Elmalı': 'Apple Orchard',
  'Cevizli': 'Walnut Grove', 'Bademli': 'Almond Grove', 'Kırkgöz': 'Forty Springs', 'Beşkonak': 'Five Mansions',
  'Kırkpınar': 'Forty Springs', 'Delikkaya': 'Holed Rock', 'Atlıbel': 'Horseman\'s Pass', 'Yalnızçam': 'Lone Pine',
}

// First words of town names (packages/shared/src/towns.ts) and lordship names (ui/panels.tsx).
const HEADS: Record<string, string> = {
  Ak: 'White', Kara: 'Black', Gök: 'Blue', Sarı: 'Yellow', Kızıl: 'Red', Yeşil: 'Green', Uzun: 'Long', Eski: 'Old',
  Yeni: 'New', Çam: 'Pine', Söğüt: 'Willow', Kavak: 'Poplar', Taş: 'Stone', Değirmen: 'Mill', Kuyu: 'Well',
  Bakır: 'Copper', Ceviz: 'Walnut', Elma: 'Apple', Pınar: 'Spring', Kırk: 'Forty', Akça: 'Whitish', Karaca: 'Roe',
  Boz: 'Grey', Ulu: 'Great', Demir: 'Iron', Ardıç: 'Juniper', Çınar: 'Plane', Meşe: 'Oak', Kuru: 'Dry', Tuz: 'Salt',
  Kum: 'Sand', Bostan: 'Garden', Saray: 'Palace', Kervan: 'Caravan', Gümüş: 'Silver', Yedi: 'Seven', Üç: 'Three',
  Koyun: 'Sheep', Keçi: 'Goat', Kestane: 'Chestnut',
  Altın: 'Golden', Kartal: 'Eagle', Ay: 'Moon', Mavi: 'Azure', Kır: 'Grizzled', Al: 'Scarlet', Yıldız: 'Star',
  Güneş: 'Sun', Şahin: 'Falcon', Doğan: 'Hawk', Ceylan: 'Gazelle', Geyik: 'Deer', Aslan: 'Lion', Kurt: 'Wolf',
  Kaplan: 'Tiger', Turna: 'Crane', Bülbül: 'Nightingale', Lale: 'Tulip', Gül: 'Rose', Menekşe: 'Violet',
  Nergis: 'Daffodil', Sedef: 'Nacre', Mercan: 'Coral', İnci: 'Pearl', Yakut: 'Ruby', Zümrüt: 'Emerald',
  Firuze: 'Turquoise', Tunç: 'Bronze', Çelik: 'Steel', Kaya: 'Rock', Bulut: 'Cloud', Rüzgar: 'Wind', Yel: 'Breeze',
  Şimşek: 'Lightning', Ilık: 'Warm', Serin: 'Cool', Derin: 'Deep', Yüce: 'Lofty', Bey: 'Lord\'s', Han: 'Khan\'s',
  Hatun: 'Lady\'s', Tekin: 'Prince\'s', Bayram: 'Feast', Sultan: 'Sultan\'s', Erguvan: 'Redbud', Safran: 'Saffron',
  Gökçe: 'Bluish', Alaca: 'Dappled', Turaç: 'Francolin', Kumral: 'Auburn', Tatlı: 'Sweet', Soğuk: 'Cold',
  Küçük: 'Little', Büyük: 'Big', Sisli: 'Misty', Karlı: 'Snowy', Atmaca: 'Sparrowhawk', Sungur: 'Gyrfalcon',
  Kumru: 'Turtledove', Keklik: 'Partridge', Ceren: 'Fawn', Pars: 'Leopard', Balaban: 'Bittern', Tay: 'Foal',
  Koç: 'Ram', Kuzu: 'Lamb', Fındık: 'Hazel', Badem: 'Almond', Nar: 'Pomegranate', Ayva: 'Quince', Armut: 'Pear',
  İncir: 'Fig', Zeytin: 'Olive', Kiraz: 'Cherry', Sedir: 'Cedar', Ihlamur: 'Linden', Yonca: 'Clover',
  Sümbül: 'Hyacinth', Karanfil: 'Carnation', Kurşun: 'Lead', Mermer: 'Marble', Kehribar: 'Amber', Elmas: 'Diamond',
  Yeşim: 'Jade', Akik: 'Agate', Şafak: 'Dawn', Seher: 'Daybreak', Tan: 'Sunrise', Yağmur: 'Rain',
  Poyraz: 'Northwind', Yıldırım: 'Thunderbolt', Ayaz: 'Frost', Duman: 'Smoke', Paşa: 'Pasha\'s', Ağa: 'Agha\'s',
  Emir: 'Emir\'s', Kağan: 'Khagan\'s', Alp: 'Hero\'s', Ata: 'Forefather\'s', Çoban: 'Shepherd\'s', Bin: 'Thousand',
  Pazar: 'Market', Derviş: 'Dervish\'s',
}
// Heads that count, so their feature reads plural ("Forty Springs").
const NUMBERS = new Set(['kırk', 'yedi', 'üç', 'bin'])

// Second words: features of the land. The possessive forms ("pınarı", "deresi") mean the same.
const TAILS: Record<string, string> = {
  köy: 'Village', ören: 'Ruins', yurt: 'Homestead', oba: 'Camp', pınar: 'Spring', dere: 'Brook', tepe: 'Hill',
  alan: 'Clearing', bük: 'Thicket', çay: 'Stream', yayla: 'Highland', kuyu: 'Well', hisar: 'Fortress', ova: 'Plain',
  kent: 'Town', kaya: 'Rock', su: 'Water', göl: 'Lake', bel: 'Saddle', kale: 'Castle', yaka: 'Bank',
  köprü: 'Bridge', çayır: 'Meadow', bağ: 'Vineyard', ağıl: 'Fold', pazar: 'Market', kışla: 'Barracks',
  bucak: 'Nook',
  ırmak: 'River', çam: 'Pine', yazı: 'Lea', dağ: 'Mountain', koru: 'Grove', kum: 'Sands', çeşme: 'Fountain',
  bahçe: 'Garden', eli: 'Land', kır: 'Wold', konak: 'Mansion', burun: 'Point', ada: 'Isle', pınarı: 'Spring',
  suyu: 'Water', ırmağı: 'River', bayır: 'Slope', taş: 'Stone', yamaç: 'Hillside', deresi: 'Brook',
  ovası: 'Plain', gölü: 'Lake', tepesi: 'Hill', sırt: 'Ridge', yolu: 'Road', saray: 'Palace', orman: 'Forest',
  çukur: 'Hollow', gedik: 'Gap', boğaz: 'Gorge', kıyı: 'Shore', korusu: 'Grove', yaylası: 'Highland', düz: 'Flat',
  otağ: 'Pavilion', yatak: 'Riverbed', özü: 'Headwater', ili: 'Country', ocak: 'Hearth', kapı: 'Gate', kemer: 'Arch',
  derbent: 'Pass', meydan: 'Square', kuyusu: 'Well', tarla: 'Field', çiftlik: 'Farm', seki: 'Terrace',
  köprüsü: 'Bridge', bağı: 'Vineyard', çeşmesi: 'Fountain',
}

const low = (s: string) => s.toLocaleLowerCase('tr-TR')
const lowered = (table: Record<string, string>) =>
  new Map(Object.entries(table).map(([k, v]) => [low(k), v] as const))
const EXACT_LOW = lowered(EXACT)
const HEADS_LOW = lowered(HEADS)
const TAILS_LOW = lowered(TAILS)
// Longest first, so "Akça" is tried before "Ak" and "Kırk" before "Kır".
const HEAD_KEYS = [...HEADS_LOW.keys()].sort((a, b) => b.length - a.length)

const plural = (gloss: string) => {
  const words = gloss.split(' ')
  const last = words[words.length - 1]
  words[words.length - 1] =
    /(ss|sh|ch|x)$/.test(last) ? `${last}es`
    : /s$/.test(last) ? last
    : /[^aeiou]y$/.test(last) ? `${last.slice(0, -1)}ies`
    : `${last}s`
  return words.join(' ')
}

// One word's meaning, or null when it is not one of the place names' roots.
function rootMeaning(word: string): string | null {
  const w = low(word)
  const exact = EXACT_LOW.get(w)
  if (exact) return exact
  for (const head of HEAD_KEYS) {
    if (w.length <= head.length || !w.startsWith(head)) continue
    const tail = TAILS_LOW.get(w.slice(head.length))
    if (tail) return `${HEADS_LOW.get(head)} ${NUMBERS.has(head) ? plural(tail) : tail}`
  }
  return null
}

// The meaning of a place's name ("Akçay Inn" → "White Stream", "Kingdom of Altınkapı" → "Golden Gate"), or null when
// none of its words is a known Turkish root.
export function nameMeaning(name: string): string | null {
  for (const token of name.split(/\s+/)) {
    // Drop a Turkish case ending after an apostrophe ("Akköy'ün") and any punctuation around the word.
    const word = token.split(/['’]/)[0].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    if (!word) continue
    const meaning = rootMeaning(word)
    if (meaning) return meaning
  }
  return null
}
