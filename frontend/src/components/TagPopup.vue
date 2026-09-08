<script setup>
import { computed, ref } from 'vue'
import { Plus, X } from '@lucide/vue'
import { useTagsStore } from '@/stores/tagsStore'

// Presentational content only - no positioning of its own. The caller
// (TaskCard) owns a useFloatingMenu instance and Teleports/positions this
// inside a plain anchor div, the same way it already does for the priority
// popover.
const props = defineProps({
  tags: { type: Array, default: () => [] }, // current full tag objects
})

const emit = defineEmits(['add', 'remove', 'close'])

const tagsStore = useTagsStore()

const showPicker = ref(false)
const search = ref('')
const creating = ref(false)
const createError = ref(null)

const currentIds = computed(() => new Set(props.tags.map((t) => t.id)))

const eligibleTags = computed(() => {
  const q = search.value.trim().toLowerCase()
  return tagsStore.tags.filter((t) => !currentIds.value.has(t.id) && (!q || t.name.toLowerCase().includes(q)))
})

const exactMatchExists = computed(() =>
  tagsStore.tags.some((t) => t.name.toLowerCase() === search.value.trim().toLowerCase()),
)

function selectTag(id) {
  emit('add', id)
  search.value = ''
}

async function createAndAdd() {
  const name = search.value.trim()
  if (!name) return
  creating.value = true
  createError.value = null
  try {
    const created = await tagsStore.createTag({ name, color: null })
    emit('add', created.id)
    search.value = ''
  } catch {
    createError.value = tagsStore.error
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="tag-popup">
    <header class="tag-popup-header">
      <span>Tags</span>
      <button type="button" class="tag-popup-close" aria-label="Close" @click="emit('close')">
        <X :size="13" />
      </button>
    </header>

    <div class="tag-popup-chips">
      <span v-for="tag in tags" :key="tag.id" class="tag-popup-chip">
        <span class="tag-popup-swatch" :style="{ background: tag.color || 'var(--line-2)' }"></span>
        {{ tag.name }}
        <button type="button" class="tag-popup-chip-remove" aria-label="Remove tag" @click="emit('remove', tag.id)">
          <X :size="10" />
        </button>
      </span>
      <p v-if="tags.length === 0" class="tag-popup-empty">No tags yet.</p>
    </div>

    <button type="button" class="tag-popup-add-btn" @click="showPicker = !showPicker">
      <Plus :size="12" /> Add tag
    </button>

    <div v-if="showPicker" class="tag-popup-picker">
      <input
        v-model="search"
        type="text"
        placeholder="Search or create tag..."
        class="tag-popup-search"
        @keydown.escape.stop="showPicker = false"
      />
      <ul class="tag-popup-picker-list">
        <li v-for="t in eligibleTags" :key="t.id">
          <button type="button" class="tag-popup-picker-option" @click="selectTag(t.id)">
            <span class="tag-popup-swatch" :style="{ background: t.color || 'var(--line-2)' }"></span>
            {{ t.name }}
          </button>
        </li>
        <li v-if="search.trim() && !exactMatchExists">
          <button type="button" class="tag-popup-picker-option tag-popup-picker-create" :disabled="creating" @click="createAndAdd">
            <Plus :size="12" /> Create "{{ search.trim() }}"
          </button>
        </li>
        <li v-if="eligibleTags.length === 0 && !search.trim()" class="tag-popup-picker-empty">No more tags to add.</li>
      </ul>
      <p v-if="createError" class="tag-popup-error">{{ createError }}</p>
    </div>
  </div>
</template>

<style scoped>
.tag-popup {
  width: 15rem;
  padding: 10px;
  border-radius: var(--r2);
  border: 1px solid var(--line-2);
  background: var(--surface);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}

.tag-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 8px;
}

.tag-popup-close {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  color: var(--mute);
  cursor: pointer;
}

.tag-popup-close:hover {
  color: var(--fg);
}

.tag-popup-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}

.tag-popup-empty {
  font-size: 11px;
  color: var(--mute);
}

.tag-popup-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 999px;
  border: 1px solid var(--line-2);
  font-size: 10.5px;
  color: var(--dim);
}

.tag-popup-swatch {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.tag-popup-chip-remove {
  display: flex;
  align-items: center;
  border: none;
  background: none;
  color: var(--mute);
  cursor: pointer;
  padding: 0;
}

.tag-popup-chip-remove:hover {
  color: var(--bad);
}

.tag-popup-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px dashed var(--line-2);
  background: transparent;
  color: var(--mute);
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.tag-popup-add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.tag-popup-picker {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

.tag-popup-search {
  width: 100%;
  padding: 5px 7px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: var(--surface2);
  color: var(--fg);
  font-family: inherit;
  font-size: 11.5px;
  margin-bottom: 5px;
}

.tag-popup-picker-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 8rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tag-popup-picker-option {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  border-radius: var(--r);
  border: none;
  background: transparent;
  color: var(--dim);
  font-family: inherit;
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}

.tag-popup-picker-option:hover {
  background: var(--surface2);
}

.tag-popup-picker-option.tag-popup-picker-create {
  color: var(--accent);
  font-weight: 600;
}

.tag-popup-picker-option:disabled {
  opacity: 0.5;
  cursor: default;
}

.tag-popup-picker-empty {
  font-size: 11px;
  color: var(--mute);
  padding: 4px 6px;
}

.tag-popup-error {
  color: var(--bad);
  font-size: 11px;
  margin: 5px 0 0;
}
</style>
