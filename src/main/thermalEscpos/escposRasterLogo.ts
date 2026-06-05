import { nativeImage } from 'electron'

export type EscposRasterLogoOptions = {
  /** Largeur utile de la tête en points (ex. 576 pour 80 mm, 384 pour 58 mm @ ~203 dpi). */
  dotsPerLine: number
  /** 5–100 : largeur du logo en % de `dotsPerLine` (comme le ticket HTML). */
  logoWidthPercent: number
  /** >1 : élargit un peu le raster (ex. 1.12), plafonné à `dotsPerLine`. */
  logoWidthScale?: number
  /** Plafond de hauteur du raster en points (évite un logo trop haut). */
  maxHeightDots?: number
}

/**
 * Convertit un logo (data URL) en commande ESC/POS raster `GS v 0` (bitmap 1 bit).
 * Chaîne vide si image absente, illisible ou trop petite.
 */
export function escposRasterLogoFromDataUrl(
  dataUrl: string | null | undefined,
  opts: EscposRasterLogoOptions
): Buffer {
  if (!dataUrl || typeof dataUrl !== 'string') return Buffer.alloc(0)
  const trimmed = dataUrl.trim()
  if (!trimmed.startsWith('data:')) return Buffer.alloc(0)

  let img: Electron.NativeImage
  try {
    img = nativeImage.createFromDataURL(trimmed)
  } catch {
    return Buffer.alloc(0)
  }
  if (img.isEmpty()) return Buffer.alloc(0)

  const pct = Math.max(5, Math.min(100, Math.round(opts.logoWidthPercent)))
  const scale =
    typeof opts.logoWidthScale === 'number' && Number.isFinite(opts.logoWidthScale) && opts.logoWidthScale > 0
      ? opts.logoWidthScale
      : 1
  const maxW = Math.min(opts.dotsPerLine, Math.floor((opts.dotsPerLine * pct * scale) / 100))
  const maxH = opts.maxHeightDots ?? Math.round(opts.dotsPerLine * 0.44)

  const { width: ow, height: oh } = img.getSize()
  if (ow < 1 || oh < 1) return Buffer.alloc(0)

  let targetW = Math.min(maxW, Math.max(ow, 8))
  targetW = Math.max(8, Math.floor(targetW / 8) * 8)
  let targetH = Math.max(1, Math.round((targetW * oh) / ow))
  if (targetH > maxH) {
    targetH = maxH
    targetW = Math.max(8, Math.floor(((targetH * ow) / oh) / 8) * 8)
  }
  if (targetW < 8) return Buffer.alloc(0)

  const resized = img.resize({ width: targetW, height: targetH })
  if (resized.isEmpty()) return Buffer.alloc(0)

  const { width, height } = resized.getSize()
  if (width < 8 || width % 8 !== 0 || height < 1) return Buffer.alloc(0)

  const bmp = resized.toBitmap()
  const stride = width * 4
  const expected = stride * height
  if (bmp.length < expected) return Buffer.alloc(0)

  const threshold = 175
  const rowBytes = width / 8
  const packed = Buffer.alloc(rowBytes * height)
  /** Windows `toBitmap` : BGRA ; macOS : ARGB (doc Electron). */
  const isWin = process.platform === 'win32'

  for (let y = 0; y < height; y++) {
    for (let bx = 0; bx < rowBytes; bx++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit
        const i = y * stride + x * 4
        const r = isWin ? bmp.readUInt8(i + 2) : bmp.readUInt8(i + 1)
        const g = isWin ? bmp.readUInt8(i + 1) : bmp.readUInt8(i + 2)
        const b = isWin ? bmp.readUInt8(i) : bmp.readUInt8(i + 3)
        const lum = 0.299 * r + 0.587 * g + 0.114 * b
        if (lum < threshold) byte |= 0x80 >> bit
      }
      packed[y * rowBytes + bx] = byte
    }
  }

  const xL = rowBytes & 0xff
  const xH = (rowBytes >> 8) & 0xff
  const yL = height & 0xff
  const yH = (height >> 8) & 0xff
  return Buffer.concat([Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]), packed])
}
