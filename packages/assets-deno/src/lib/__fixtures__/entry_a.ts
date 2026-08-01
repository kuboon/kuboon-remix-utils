import { encodeHex } from '@std/encoding/hex'

import { counter } from './shared.ts'

export function a(): string {
  return `${encodeHex(new Uint8Array([1]))}:${counter.bump()}`
}
