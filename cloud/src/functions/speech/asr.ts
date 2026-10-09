import * as tencentcloud from 'tencentcloud-sdk-nodejs-asr'
import { AppError } from '../../lib/errors'

const AsrClient = tencentcloud.asr.v20190614.Client

type Credential = { secretId: string; secretKey: string }

/** 把腾讯云的错误码翻译成可操作的提示 */
export function toAsrError(err: unknown): AppError {
  const code = String((err as { code?: unknown })?.code ?? '')
  if (code.startsWith('AuthFailure')) {
    return new AppError(
      'NOT_CONFIGURED',
      '语音识别密钥无效，请检查 speech 云函数的 TENCENT_SECRET_ID / TENCENT_SECRET_KEY',
    )
  }
  if (code.startsWith('UnauthorizedOperation')) {
    return new AppError('NOT_CONFIGURED', '这组密钥没有语音识别权限，请在腾讯云访问管理中授权')
  }
  if (/ServiceIsolate|UserNotRegistered|NoFreeAccount|ResourceInsufficient/.test(code)) {
    return new AppError('NOT_CONFIGURED', '腾讯云语音识别未开通或已欠费')
  }
  if (/Timeout|timed out/i.test(`${code} ${(err as Error)?.message ?? ''}`)) {
    return new AppError('TIMEOUT', '语音识别超时，请重试')
  }
  return new AppError('UPSTREAM_ERROR', '语音识别失败，请重试')
}

export function createZhRecognizer(getCredential: () => Credential) {
  let client: InstanceType<typeof AsrClient> | null = null

  return async function recognizeZh(audio: Buffer): Promise<string> {
    client ??= new AsrClient({
      credential: getCredential(),
      region: '',
      profile: { httpProfile: { reqTimeout: 15 } },
    })
    try {
      const res = await client.SentenceRecognition({
        EngSerViceType: '16k_zh',
        SourceType: 1,
        VoiceFormat: 'pcm',
        Data: audio.toString('base64'),
        DataLen: audio.length,
        FilterPunc: 0,
        ConvertNumMode: 1,
      })
      return res.Result ?? ''
    } catch (err) {
      throw toAsrError(err)
    }
  }
}
