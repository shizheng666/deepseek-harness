/** Generate the checked-in Windows icon from the Web application's canonical mark. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const sizes = [16, 24, 32, 48, 64, 128, 256]
const desktopRoot = resolve(import.meta.dirname, '..')
const sourcePath = resolve(desktopRoot, '../web/public/favicon.svg')
const outputPath = resolve(desktopRoot, 'assets/icon.ico')

function iconDirectory(images) {
  const headerSize = 6 + images.length * 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = headerSize
  for (const [index, image] of images.entries()) {
    const entry = 6 + index * 16
    header.writeUInt8(image.size === 256 ? 0 : image.size, entry)
    header.writeUInt8(image.size === 256 ? 0 : image.size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(image.png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += image.png.length
  }
  return header
}

const source = readFileSync(sourcePath, 'utf8')
  .replace('width="50.000000"', 'width="256"')
  .replace('height="50.000000"', 'height="256"')
const images = await Promise.all(sizes.map(async size => ({
  size,
  png: await sharp(Buffer.from(source)).resize(size, size).png().toBuffer(),
})))
mkdirSync(resolve(desktopRoot, 'assets'), { recursive: true })
writeFileSync(outputPath, Buffer.concat([iconDirectory(images), ...images.map(image => image.png)]))
