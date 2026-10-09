import { createFunction, getCloud } from '../../lib/cloud'
import { env } from '../../lib/env'
import { createZhRecognizer } from './asr'
import { createSpeechHandlers } from './handlers'

const cloud = getCloud()

export const main = createFunction(
  'speech',
  createSpeechHandlers({
    storage: {
      async download(fileID) {
        const res = (await cloud.downloadFile({ fileID })) as { fileContent: Buffer }
        return res.fileContent
      },
      async remove(fileID) {
        await cloud.deleteFile({ fileList: [fileID] })
      },
    },
    recognizeZh: createZhRecognizer(env.tencentCredential),
  }),
)
