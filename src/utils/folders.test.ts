import { describe, expect, it } from 'vitest'
import type { Folder } from '@shared/types'
import { canCreateIn, canMoveInto, childrenOf, flattenTree, folderPath, subtreeOf } from './folders'

const f = (id: string, parentId: string | null, depth: number, order: number): Folder => ({
  id,
  name: id.toUpperCase(),
  parentId,
  depth,
  order,
  createdAt: 0,
})

// a(b(c), d), e
const FOLDERS = [
  f('e', null, 1, 1),
  f('d', 'a', 2, 1),
  f('c', 'b', 3, 0),
  f('b', 'a', 2, 0),
  f('a', null, 1, 0),
]

describe('folder tree', () => {
  it('lists one level in order and flattens in tree order', () => {
    expect(childrenOf(FOLDERS, null).map((x) => x.id)).toEqual(['a', 'e'])
    expect(flattenTree(FOLDERS).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('path and subtree', () => {
    expect(folderPath(FOLDERS, 'c').map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(folderPath(FOLDERS, null)).toEqual([])
    expect(
      subtreeOf(FOLDERS, 'a')
        .map((x) => x.id)
        .sort(),
    ).toEqual(['a', 'b', 'c', 'd'])
  })

  it('allows new subfolders only within three levels', () => {
    expect(canCreateIn(null)).toBe(true)
    expect(canCreateIn(FOLDERS.find((x) => x.id === 'b')!)).toBe(true)
    expect(canCreateIn(FOLDERS.find((x) => x.id === 'c')!)).toBe(false)
  })

  it('cannot move into its own subtree or deeper than three levels', () => {
    const byId = (id: string) => FOLDERS.find((x) => x.id === id)!
    expect(canMoveInto(FOLDERS, 'a', byId('c'))).toBe(false)
    expect(canMoveInto(FOLDERS, 'b', byId('e'))).toBe(true)
    expect(canMoveInto(FOLDERS, 'b', byId('d'))).toBe(false)
    expect(canMoveInto(FOLDERS, 'c', null)).toBe(true)
  })
})
