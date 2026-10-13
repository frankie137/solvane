import type { Profile, Share, ShareSummary } from '@shared/types'
import { callCloud, uploadFile } from './cloud'

export async function getProfile(): Promise<Profile | null> {
  return (await callCloud('data', 'getProfile', {})).profile
}

/** Save the byline; avatarPath is the newly chosen avatar (a local temp file), uploaded to avatars/ first */
export async function saveProfile(nickname: string, avatarPath?: string): Promise<Profile> {
  let avatarFileID: string | undefined
  if (avatarPath) {
    const ext = /\.(png|webp|jpe?g)$/i.exec(avatarPath)?.[1]?.toLowerCase() ?? 'jpg'
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    avatarFileID = await uploadFile(avatarPath, `avatars/${name}.${ext}`)
  }
  return (
    await callCloud('data', 'updateProfile', {
      nickname,
      ...(avatarFileID ? { avatarFileID } : {}),
    })
  ).profile
}

export async function createShare(practiceId: string): Promise<string> {
  return (await callCloud('data', 'createShare', { practiceId })).shareId
}

export async function getShare(shareId: string): Promise<Share> {
  return (await callCloud('data', 'getShare', { shareId })).share
}

export async function listShares(): Promise<ShareSummary[]> {
  return (await callCloud('data', 'listShares', {})).items
}

export async function revokeShare(shareId: string): Promise<void> {
  await callCloud('data', 'revokeShare', { shareId })
}

export const sharePath = (shareId: string) =>
  `/pkg-share/play/index?shareId=${encodeURIComponent(shareId)}`
