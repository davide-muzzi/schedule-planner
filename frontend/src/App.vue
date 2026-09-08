<script setup>
import { onBeforeUnmount, watch } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useTagsStore } from '@/stores/tagsStore'
import AppSidebar from '@/components/AppSidebar.vue'
import Toast from '@/components/Toast.vue'

const route = useRoute()
const authStore = useAuthStore()
const store = useScheduleStore()
const tasksStore = useTasksStore()
const tagsStore = useTagsStore()

// Re-checks Backlog/Ready/InProgress against "now" every minute while the
// app is open and logged in, so a task flips to In Progress the moment its
// linked entry starts rather than only the next time something else happens
// to reload it.
const STATUS_SYNC_INTERVAL_MS = 60000
let statusSyncTimer = null

function stopStatusSync() {
  clearInterval(statusSyncTimer)
  statusSyncTimer = null
}

// Watches (rather than onMounted) because the router guard's session check
// resolves asynchronously - by the time it settles, App.vue may already have
// mounted while logged out. This fires both on an already-authenticated
// mount and right after a login completes.
watch(
  () => authStore.isAuthenticated,
  async (isAuthenticated) => {
    stopStatusSync()
    if (!isAuthenticated) return

    store.fetchAdjustment()
    store.fetchWorkGoal()
    store.fetchHolidayYearSetting(store.currentHolidayYear)

    // Entries and tasks both need to be in before a task's derived status
    // can be computed - the Tasks page re-runs this same check on its own
    // mount too, to catch it immediately after navigating in.
    const [entries] = await Promise.all([
      store.fetchAll().then(() => store.entries),
      tasksStore.fetchAll(),
      tagsStore.fetchAll(),
    ])
    await tasksStore.syncTaskStatuses(entries)
    statusSyncTimer = setInterval(() => tasksStore.syncTaskStatuses(store.entries), STATUS_SYNC_INTERVAL_MS)
  },
  { immediate: true },
)

onBeforeUnmount(stopStatusSync)
</script>

<template>
  <template v-if="route.name === 'login'">
    <RouterView />
  </template>
  <div v-else class="shell">
    <AppSidebar />
    <main class="shell-main">
      <RouterView />
    </main>
  </div>

  <Toast />
</template>

<style scoped>
.shell {
  display: flex;
  height: 100vh;
  min-height: 640px;
  overflow: hidden;
}

.shell-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 38px 44px 60px;
}

/* A phone held sideways rarely clears the 640px floor below, and it must
   never force the whole shell (sidebar included) to scroll as one block -
   only .shell-main should scroll, so the sidebar stays put. */
@media (max-width: 900px) {
  .shell {
    height: 100dvh;
    min-height: 0;
  }

  .shell-main {
    padding: 18px 16px 36px;
  }
}
</style>
