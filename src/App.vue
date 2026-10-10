<script setup lang="ts">
import { onError, onLaunch, onUnhandledRejection } from '@dcloudio/uni-app'
import { logError } from '@/utils/log'

onLaunch(() => {})

// 没被捕获的异常写进实时日志，便于排查真机上的问题
onError((err) => logError('app.onError', err))
onUnhandledRejection((res) => logError('app.unhandledRejection', res.reason))
</script>

<style lang="scss">
@import './styles/index.scss';
</style>
