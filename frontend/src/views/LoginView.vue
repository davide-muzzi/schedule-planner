<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { extractErrorMessage } from '@/utils/apiError'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const error = ref(null)
const loading = ref(false)

async function submit() {
  error.value = null
  loading.value = true
  try {
    await authStore.login(username.value, password.value)
    router.push(route.query.redirect || { name: 'planner' })
  } catch (err) {
    error.value = err?.response?.status === 401
      ? 'Invalid username or password.'
      : extractErrorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-shell">
    <form class="login-card" @submit.prevent="submit">
      <h1>Schedule Planner</h1>

      <label class="field">
        <span>Username</span>
        <input v-model="username" type="text" autocomplete="username" autofocus required />
      </label>

      <label class="field">
        <span>Password</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <button type="submit" :disabled="loading">
        {{ loading ? 'Signing in...' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login-shell {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  background-image: var(--bg-img);
}

.login-card {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 32px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r3);
}

h1 {
  margin: 0 0 8px;
  font-size: 1.1rem;
  color: var(--fg);
  text-align: center;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--dim);
}

input {
  font: inherit;
  padding: 8px 10px;
  background: var(--track);
  border: 1px solid var(--line);
  border-radius: var(--r2);
  color: var(--fg);
}

input:focus {
  outline: none;
  border-color: var(--accent);
}

button {
  font: inherit;
  padding: 9px 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--r2);
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  margin: 0;
  font-size: 0.85rem;
  color: var(--bad);
}
</style>
