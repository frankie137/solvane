<script setup lang="ts">
import { onError, onLaunch, onUnhandledRejection } from '@dcloudio/uni-app'
import { logError } from '@/utils/log'

onLaunch(() => {})

// Write uncaught errors to the realtime log to help debug issues on real devices
onError((err) => logError('app.onError', err))
onUnhandledRejection((res) => logError('app.unhandledRejection', res.reason))
</script>

<style lang="scss">
@import './styles/index.scss';
</style>
