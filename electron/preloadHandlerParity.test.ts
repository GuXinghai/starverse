import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(full)
    return /\.ts$/u.test(name) && !/\.(test|d)\.ts$/u.test(name) && name !== 'preload.ts' ? [full] : []
  })
}

describe('electronAPI preload surface', () => {
  it('exposes no channel literal without a main-process handler', () => {
    const preload = readFileSync(join(__dirname, 'preload.ts'), 'utf8')
    const region = preload.slice(preload.indexOf("exposeInMainWorld('electronAPI'"))
    const channels = [...region.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/gu)].map((match) => match[1]!)
    expect(channels.length).toBeGreaterThan(0)
    const main = sourceFiles(__dirname).map((file) => readFileSync(file, 'utf8')).join('\n')
    const orphaned = channels.filter((channel) => !main.includes(`'${channel}'`) && !main.includes(`"${channel}"`))
    expect(orphaned).toEqual([])
  })
})
