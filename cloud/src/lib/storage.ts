import type * as Sdk from 'wx-server-sdk'

/** 临时链接有效期（秒） */
const TEMP_URL_MAX_AGE = 2 * 3600
/** getTempFileURL 一次最多换 50 个 */
const TEMP_URL_BATCH = 50

/** 云存储的最小封装：下载、上传、删除、换临时链接 */
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
