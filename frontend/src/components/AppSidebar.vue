<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  Clock,
  LayoutList,
  ChartBar,
  CloudSun,
  SlidersHorizontal,
  SunDim,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from '@lucide/vue'
import { useAppShell } from '@/composables/useAppShell'
import { getISOWeekNumber } from '@/utils/date'

const route = useRoute()
const { theme, collapsed, toggleTheme, toggleCollapsed } = useAppShell()

const NAV_ITEMS = [
  { to: '/planner', label: 'Planner', icon: LayoutList },
  { to: '/overview', label: 'Overview', icon: ChartBar },
  { to: '/weather', label: 'Weather', icon: CloudSun },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
]

const now = new Date()
const weekLabel = `Week ${getISOWeekNumber(now)} · ${now.getFullYear()}`

function isActive(to) {
  return route.path === to
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div class="brand">
      <div class="brand-mark"><Clock :size="14" /></div>
      <div class="brand-text">
        <div class="brand-name">Schedule</div>
        <div class="brand-week">{{ weekLabel }}</div>
      </div>
    </div>

    <nav class="nav">
      <RouterLink v-for="item in NAV_ITEMS" :key="item.to" :to="item.to" custom v-slot="{ navigate }">
        <button
          type="button"
          class="nav-item"
          :class="{ active: isActive(item.to) }"
          :title="item.label"
          :aria-label="item.label"
          @click="navigate"
        >
          <span class="nav-mark"></span>
          <component :is="item.icon" :size="17" class="nav-icon" />
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </RouterLink>
    </nav>

    <div class="footer">
      <button
        type="button"
        class="theme-btn"
        :title="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggleTheme"
      >
        <component :is="theme === 'dark' ? SunDim : Moon" :size="16" class="theme-icon" />
        <span class="theme-label">{{ theme === 'dark' ? 'Dark mode' : 'Light mode' }}</span>
      </button>
      <button
        type="button"
        class="collapse-btn"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="toggleCollapsed"
      >
        <component :is="collapsed ? PanelLeftOpen : PanelLeftClose" :size="16" class="collapse-icon" />
        <span class="collapse-label">Collapse</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  flex: none;
  width: 248px;
  display: flex;
  flex-direction: column;
  background: var(--sb);
  border-right: 1px solid var(--line);
  transition: width 0.22s var(--ease);
  overflow: hidden;
}

.sidebar.collapsed {
  width: 68px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px 20px 20px;
  border-bottom: 1px solid var(--line);
}

.brand-mark {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: var(--r);
  border: 1px solid var(--accent);
  display: grid;
  place-items: center;
  color: var(--accent);
}

.brand-text {
  min-width: 0;
  opacity: 1;
  transition: opacity 0.18s;
  white-space: nowrap;
}

.sidebar.collapsed .brand-text {
  opacity: 0;
}

.brand-name {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--fg);
}

.brand-week {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--mute);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 14px;
  flex: 1;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-radius: var(--r2);
  background: transparent;
  color: var(--dim);
  font-family: inherit;
  font-size: 13px;
  font-weight: 400;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.16s,
    color 0.16s;
}

.nav-item:hover {
  background: var(--accent-tint);
  color: var(--fg);
}

.nav-item.active {
  background: var(--accent-tint);
  color: var(--fg);
  font-weight: 600;
}

.nav-mark {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: transparent;
  border-radius: 2px;
}

.nav-item.active .nav-mark {
  background: var(--accent);
}

.nav-icon {
  flex: none;
}

.nav-label,
.theme-label,
.collapse-label {
  opacity: 1;
  transition: opacity 0.18s;
}

.sidebar.collapsed .nav-label,
.sidebar.collapsed .theme-label,
.sidebar.collapsed .collapse-label {
  opacity: 0;
}

.footer {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 16px 16px 20px;
  border-top: 1px solid var(--line);
}

.theme-btn {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--r2);
  background: transparent;
  color: var(--mute);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.16s;
}

.theme-btn:hover {
  color: var(--fg);
}

.theme-icon {
  flex: none;
}

.collapse-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--r2);
  background: transparent;
  color: var(--mute);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.16s;
}

.collapse-btn:hover {
  color: var(--fg);
}

.collapse-icon {
  flex: none;
}
</style>
