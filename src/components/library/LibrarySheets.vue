<template>
  <folder-picker
    v-model:show="organizer.picker.show"
    :current="organizer.picker.current"
    @pick="organizer.onPick"
  />
  <folder-picker
    v-model:show="folders.mover.show"
    title="移动文件夹到"
    :current="folders.mover.current"
    :moving-folder-id="folders.mover.movingId"
    @pick="folders.onMovePick"
  />
  <tag-editor
    v-model:show="organizer.tagger.show"
    :tags="organizer.tagger.tags"
    :known="organizer.tagger.known"
    :saving="organizer.tagger.saving"
    @save="organizer.onTags"
  />
</template>

<script setup lang="ts">
import { useLibraryActions } from '@/composables/useLibraryActions'
import FolderPicker from './FolderPicker.vue'
import TagEditor from './TagEditor.vue'

const { organizer, folders } = useLibraryActions()
</script>
