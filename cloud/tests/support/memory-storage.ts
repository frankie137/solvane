import type { ShareStorage } from '../../src/functions/data/share'

/** In-memory cloud storage: fileID is cloud://env.x/<path>, temp URL is https://tmp/<fileID> */
export function createMemoryStorage(): ShareStorage & {
  files: Map<string, Buffer>
  removed: string[]
} {
  const files = new Map<string, Buffer>()
  const removed: string[] = []
  return {
    files,
    removed,
    async download(fileID) {
      const data = files.get(fileID)
      if (!data) throw new Error(`no such file: ${fileID}`)
      return data
    },
    async upload(cloudPath, data) {
      const fileID = `cloud://env.x/${cloudPath}`
      files.set(fileID, data)
      return fileID
    },
    async remove(fileID) {
      removed.push(fileID)
      files.delete(fileID)
    },
    async tempUrls(fileIDs) {
      return fileIDs.map((id) =>
        files.has(id) || id.includes('/avatars/') ? `https://tmp/${id}` : '',
      )
    },
  }
}
