import fs from 'fs'
import fsP from 'fs/promises'
import { join, resolve } from 'path'

import yaml from 'yaml'

const fileName = '.spotlight-manager.yaml'
if (!process.env.HOME) throw new Error('$HOME undefined')
const dfPath = join(process.env.HOME, fileName)

export function createContext (path: fs.PathLike = dfPath, encoding: BufferEncoding = 'utf-8') {
  path = resolve(path.toString(encoding))

  if (!fs.existsSync(path)) {
    fs.writeFileSync(path, '')
  }

  // TODO more type-safe
  async function get () {
    const yml = await fsP.readFile(path, encoding)
    const config = yaml.parse(yml) as Record<string, unknown> | null ?? {}
    return {
      spotlightPList: (config.spotlightPList || '/System/Volumes/Data/.Spotlight-V100/VolumeConfiguration.plist') as string,
      excludes: (config.excludes || []) as Array<{ name: string, base: string }>
    }
  }

  type Config = Awaited<ReturnType<typeof get>>
  type ExcludeEntry = Config['excludes'][number]

  async function set (config: Config) {
    fs.writeFileSync(path, yaml.stringify(config))
  }

  async function getExcludes () {
    const conf = await get()

    return conf.excludes
  }

  async function setExcludes (excludes: Config['excludes']) {
    const conf = await get()

    conf.excludes = excludes

    await set(conf)
  }

  return {
    get,
    set,

    excludes: {
      get: getExcludes,
      set: setExcludes,
      async insert (exclude: ExcludeEntry) {
        const config = await get()
        config.excludes.push(exclude)
        await set(config)
      },
      async removeOne (removing: ExcludeEntry) {
        const config = await get()
        config.excludes.filter(ex => ex.name === removing.name && ex.base === removing.base)
        await set(config)
      }
    }
  }
}
