<script setup>
import { ref, computed } from 'vue'
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
import { useAppShell, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from '@/composables/useAppShell'
import { getISOWeekNumber } from '@/utils/date'

const route = useRoute()
const { theme, collapsed, toggleTheme, toggleCollapsed, sidebarWidth, setSidebarWidth, isNarrowViewport } =
  useAppShell()

// On a narrow (phone-landscape-ish) viewport the sidebar is a full overlay
// drawer - closed by default, off-screen rather than squeezed to width 0,
// so it never eats into the page's own width. A small floating button in
// the corner opens it; it layers on top of the page (with a backdrop)
// instead of pushing content over, same as any mobile nav drawer. This is
// separate, session-only state (not persisted like the desktop `collapsed`
// toggle), since it's meant to close again once you've navigated rather
// than stick open.
const mobileSidebarOpen = ref(false)

// Whether the sidebar is showing its icon-only appearance right now - only
// a desktop concept. On mobile the drawer is always the full nav (never
// icon-only) since it's an overlay now, not something that costs page width.
const effectiveCollapsed = computed(() => (isNarrowViewport.value ? false : collapsed.value))

// Live width while actively dragging the resize handle - only committed to
// the persisted sidebarWidth (and localStorage) on mouseup, so a drag
// doesn't write on every mousemove tick.
const resizing = ref(false)
const dragPreviewWidth = ref(null)
function currentWidth() {
  if (isNarrowViewport.value) return resizing.value ? dragPreviewWidth.value : sidebarWidth.value
  return effectiveCollapsed.value ? 68 : resizing.value ? dragPreviewWidth.value : sidebarWidth.value
}

// On mobile the same footer button that collapses the desktop sidebar
// instead closes the mobile drawer back down to just the floating button -
// same physical control, same "put the sidebar away" intent.
function handleCollapseClick() {
  if (isNarrowViewport.value) mobileSidebarOpen.value = false
  else toggleCollapsed()
}

function handleResizeMouseDown(event) {
  if (effectiveCollapsed.value) return
  event.preventDefault()
  resizing.value = true
  dragPreviewWidth.value = sidebarWidth.value
  document.addEventListener('mousemove', handleResizeMouseMove)
  document.addEventListener('mouseup', handleResizeMouseUp)
}

function handleResizeMouseMove(event) {
  dragPreviewWidth.value = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, event.clientX))
}

function handleResizeMouseUp() {
  document.removeEventListener('mousemove', handleResizeMouseMove)
  document.removeEventListener('mouseup', handleResizeMouseUp)
  if (dragPreviewWidth.value !== null) setSidebarWidth(dragPreviewWidth.value)
  resizing.value = false
  dragPreviewWidth.value = null
}

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
  <div
    v-if="isNarrowViewport && mobileSidebarOpen"
    class="mobile-backdrop"
    @click="mobileSidebarOpen = false"
  ></div>

  <aside
    class="sidebar"
    :class="{ collapsed: effectiveCollapsed, resizing, 'mobile-open': isNarrowViewport && mobileSidebarOpen }"
    :style="{ width: currentWidth() + 'px' }"
  >
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
        :title="isNarrowViewport ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :aria-label="isNarrowViewport ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="handleCollapseClick"
      >
        <component :is="!isNarrowViewport && collapsed ? PanelLeftOpen : PanelLeftClose" :size="16" class="collapse-icon" />
        <span class="collapse-label">{{ isNarrowViewport ? 'Close' : 'Collapse' }}</span>
      </button>
    </div>

    <div
      v-if="!effectiveCollapsed"
      class="sidebar-resize-handle"
      title="Drag to resize"
      @mousedown="handleResizeMouseDown"
    ></div>
  </aside>

  <button
    v-if="isNarrowViewport && !mobileSidebarOpen"
    type="button"
    class="mobile-open-fab"
    title="Open menu"
    aria-label="Open menu"
    @click="mobileSidebarOpen = true"
  >
    <PanelLeftOpen :size="18" />
  </button>
</template>

<style scoped>
.sidebar {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--sb);
  border-right: 1px solid var(--line);
  transition: width 0.22s var(--ease);
  overflow: hidden;
}

.sidebar.resizing {
  transition: none;
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 5px;
  cursor: col-resize;
  background: transparent;
}

.sidebar-resize-handle:hover {
  background: var(--accent-tint);
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

/* Only ever rendered on a narrow viewport (see the v-if above), so this
   doesn't need its own media query - it's what stands in for the sidebar
   entirely while the mobile drawer is closed. */
.mobile-open-fab {
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 60;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: var(--r2);
  border: 1px solid var(--line-2);
  background: var(--sb);
  color: var(--dim);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.mobile-open-fab:hover {
  color: var(--fg);
  border-color: var(--accent);
}

/* Mobile drawer: layers above the page instead of squeezing .shell-main -
   position:fixed takes it out of the flex layout entirely (so .shell-main
   is always full width here, regardless of open/closed), and visibility is
   a transform slide rather than an animated width. */
.mobile-backdrop {
  position: fixed;
  inset: 0;
  z-index: 65;
  background: rgba(0, 0, 0, 0.45);
}

@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 70;
    transform: translateX(-100%);
    transition: transform 0.22s var(--ease);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.35);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
  }
}
</style>
