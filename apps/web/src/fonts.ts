import digits from '@fontsource/jersey-10/files/jersey-10-latin-400-normal.woff2?url'

// Pixelify Sans draws its 2 like a Z and its 5 like an S, so the digits 0–9 come from Jersey 10, a tall pixel font
// whose 8, 3, 5 and 6 stay apart (Tiny5's 8 read like a 0). Declared for every weight so bold numbers are not smeared
// by faux bold; listed first in --font (and in the map's labels), it covers only the digits and Pixelify draws the
// rest. Scaled so its digits stand a little taller than Pixelify's capitals, so small numbers stay readable.
const face = new FontFace('Digits', `url(${digits}) format('woff2')`, { unicodeRange: 'U+0030-0039', weight: '100 900', sizeAdjust: '130%' } as FontFaceDescriptors)
document.fonts.add(face)
face.load().catch(() => null)
