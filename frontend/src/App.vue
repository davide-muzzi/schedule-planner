<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useScheduleStore } from '@/stores/scheduleStore'
import AppSidebar from '@/components/AppSidebar.vue'
import Toast from '@/components/Toast.vue'

const store = useScheduleStore()

onMounted(() => {
  store.fetchAll()
  store.fetchAdjustment()
  store.fetchWorkGoal()
  store.fetchHolidayYearSetting(store.currentHolidayYear)
})
</script>

<template>
  <div class="shell">
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
</style>
