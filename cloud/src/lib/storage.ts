import type * as Sdk from 'wx-server-sdk'

/** Temporary URL lifetime (seconds) */
const TEMP_URL_MAX_AGE = 2 * 3600
/** getTempFileURL handles at most 50 files per call */
const TEMP_URL_BATCH = 50

/** Minimal cloud storage wrapper: download, upload, delete, get temporary URLs */
export function createWxStorage(cloud: typeof Sdk) {
  return {
    async download(fileID: string): Promise<Buffer> {
      const res = (await cloud.downloadFile({ fileID })) as { fileContent: Buffer }
      return res.fileContent
    },
    async upload(cloudPath: string, data: Buffer): Promise<string> {
      const res = (await cloud.uploadFile({ cloudPath, fileContent: data })) as { fileID: string }
      return res.fileID
    },
    async remove(fileID: string): Promise<void> {
      await cloud.deleteFile({ fileList: [fileID] })
    },
    async tempUrls(fileIDs: string[]): Promise<string[]> {
      const byId = new Map<string, string>()
      for (let i = 0; i < fileIDs.length; i += TEMP_URL_BATCH) {
        const res = (await cloud.getTempFileURL({
          fileList: fileIDs
            .slice(i, i + TEMP_URL_BATCH)
            .map((fileID) => ({ fileID, maxAge: TEMP_URL_MAX_AGE })),
        })) as { fileList: { fileID: string; tempFileURL: string }[] }
        for (const f of res.fileList) byId.set(f.fileID, f.tempFileURL)
      }
      return fileIDs.map((id) => byId.get(id) ?? '')
    },
  }
}
