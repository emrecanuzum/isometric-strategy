import digits from '@fontsource/tiny5/files/tiny5-latin-400-normal.woff2?url'

// Pixelify Sans draws its 2 like a Z and its 5 like an S, so the digits 0–9 come from Tiny5, a pixel font of the
// same height. Declared for every weight so bold numbers are not smeared by faux bold; listed first in --font (and
// in the map's labels), it covers only the digits and Pixelify draws the rest. Drawn a little larger than the letters,
// so small numbers stay readable.
const face = new FontFace('Digits', `url(${digits}) format('woff2')`, { unicodeRange: 'U+0030-0039', weight: '100 900', sizeAdjust: '120%' } as FontFaceDescriptors)
document.fonts.add(face)
face.load().catch(() => null)
