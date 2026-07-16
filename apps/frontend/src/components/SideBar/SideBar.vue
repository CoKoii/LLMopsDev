<script setup lang="ts">
import { changeCurrentPasswordApi, updateCurrentProfileApi } from '@/api'
import AppModal from '@/components/AppModal/AppModal.vue'
import { mainRoutes } from '@/router/menus'
import { useAuthStore } from '@/stores/auth'
import { LogoutOutlined, PlusOutlined, SettingOutlined } from '@antdv-next/icons'
import { Button, Dropdown, Form, FormItem, Input, InputPassword, message } from 'antdv-next'
import type { FormInstance, MenuProps } from 'antdv-next'
import { computed, onMounted, reactive, ref } from 'vue'
import type { RouteRecordNameGeneric, RouteRecordRaw } from 'vue-router'
import { useRoute } from 'vue-router'

const route = useRoute()
const authStore = useAuthStore()
const accountSettingsOpen = ref(false)
const profileFormRef = ref<FormInstance>()
const passwordFormRef = ref<FormInstance>()
const profileLoading = ref(false)
const passwordLoading = ref(false)
const editingNickname = ref(false)
const editingPassword = ref(false)

type CurrentUserInfo = {
  username?: string
  profile?: {
    nickname?: string
  } | null
}

const profileForm = reactive({
  nickname: '',
})

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const currentUser = computed(() => authStore.userInfo as CurrentUserInfo | undefined)
const displayName = computed(
  () => currentUser.value?.profile?.nickname || currentUser.value?.username || '未命名用户',
)
const accountName = computed(() => currentUser.value?.username || '未绑定账号')

const passwordRules = {
  currentPassword: [{ required: true, message: '请输入原密码' }],
  newPassword: [
    { required: true, message: '请输入新密码' },
    { min: 6, max: 20, message: '新密码长度应在6到20之间' },
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码' },
    {
      validator: (_rule: unknown, value: string) => {
        if (!value || value === passwordForm.newPassword) {
          return Promise.resolve()
        }
        return Promise.reject(new Error('两次输入的新密码不一致'))
      },
    },
  ],
}

const userMenuItems: MenuProps['items'] = [
  {
    key: 'account-settings',
    icon: SettingOutlined,
    label: '账号设置',
  },
  {
    key: 'divider',
    type: 'divider',
  },
  {
    key: 'logout',
    icon: LogoutOutlined,
    label: '退出登录',
    danger: true,
  },
]

function getMenuName(item: RouteRecordRaw): RouteRecordNameGeneric | undefined {
  const activeMenu = item.meta?.activeMenu
  return typeof activeMenu === 'string' ? activeMenu : item.name
}

function isMenuActive(item: RouteRecordRaw) {
  const menuName = getMenuName(item)

  if (!menuName) return false

  return route.matched.some(
    (record) => record.name === menuName || record.meta.activeMenu === menuName,
  )
}

function syncProfileForm() {
  profileForm.nickname = displayName.value
}

function cancelEditNickname() {
  syncProfileForm()
  profileFormRef.value?.clearValidate()
  editingNickname.value = false
}

function resetPasswordForm() {
  passwordForm.currentPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordFormRef.value?.clearValidate()
}

function cancelEditPassword() {
  resetPasswordForm()
  editingPassword.value = false
}

async function openAccountSettings() {
  await authStore.getUserInfo()
  syncProfileForm()
  resetPasswordForm()
  editingNickname.value = false
  editingPassword.value = false
  accountSettingsOpen.value = true
}

async function saveProfile() {
  const nickname = profileForm.nickname.trim()

  if (!nickname) {
    message.error('请输入账号昵称')
    return
  }

  profileForm.nickname = nickname
  await profileFormRef.value?.validate()

  profileLoading.value = true
  try {
    const updatedUser = await updateCurrentProfileApi({ nickname })
    authStore.setUserInfo(updatedUser)
    syncProfileForm()
    editingNickname.value = false
    message.success('账号昵称已更新')
  } finally {
    profileLoading.value = false
  }
}

async function changePassword() {
  await passwordFormRef.value?.validate()

  passwordLoading.value = true
  try {
    await changeCurrentPasswordApi({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
      confirmPassword: passwordForm.confirmPassword,
    })
    resetPasswordForm()
    editingPassword.value = false
    message.success('密码已更新')
  } finally {
    passwordLoading.value = false
  }
}

async function handleUserMenuClick({ key }: { key: string | number }) {
  if (key === 'account-settings') {
    await openAccountSettings()
    return
  }

  if (key === 'logout') {
    await authStore.authLogout()
  }
}

onMounted(() => {
  void authStore.getUserInfo()
})
</script>

<template>
  <div class="SideBar">
    <div class="content">
      <div class="main">
        <div class="title">
          <img src="@/assets/images/logo.png" alt="Logo" class="logo" />
          <span class="text">苏应LLMOps</span>
        </div>
        <Button type="primary" block class="create-btn">
          <template #icon>
            <PlusOutlined />
          </template>
          创建AI应用
        </Button>
        <div class="menus">
          <div class="menu-item" v-for="item in mainRoutes" :key="item.path">
            <div class="tag" v-if="item.meta?.tag">{{ item.meta.tag }}</div>
            <router-link
              :to="{ name: getMenuName(item) }"
              class="link"
              :class="{ active: isMenuActive(item) }"
            >
              <component :is="item.meta?.icon" v-if="item.meta?.icon" class="icon" />
              <span class="text">{{ item.meta?.title }}</span>
            </router-link>
          </div>
        </div>
      </div>
      <Dropdown
        :menu="{ items: userMenuItems }"
        :trigger="['hover']"
        :mouse-enter-delay="0"
        :mouse-leave-delay="0.12"
        placement="topRight"
        @menu-click="handleUserMenuClick"
      >
        <div class="user">
          <div class="avatar">
            <img src="http://q1.qlogo.cn/g?b=qq&nk=2655257336&s=100" alt="Avatar" />
          </div>
          <div class="info">
            <div class="name">{{ displayName }}</div>
            <div class="email">{{ accountName }}</div>
          </div>
        </div>
      </Dropdown>
    </div>

    <AppModal
      v-model:open="accountSettingsOpen"
      width="70rem"
      :footer="null"
      wrap-class-name="account-settings-modal"
    >
      <div class="account-settings">
        <aside class="settings-nav">
          <h2 class="settings-title">设置</h2>
          <div class="settings-nav-item active">账号设置</div>
        </aside>

        <main class="settings-main">
          <h2 class="settings-main-title">账号设置</h2>

          <div class="settings-field">
            <div class="field-label required">账号头像</div>
            <img
              class="settings-avatar"
              src="http://q1.qlogo.cn/g?b=qq&nk=2655257336&s=100"
              alt="Avatar"
            />
          </div>

          <div class="settings-field">
            <div class="field-label required">账号昵称</div>
            <div v-if="!editingNickname" class="field-display">
              <span>{{ displayName }}</span>
              <Button type="link" class="inline-action" @click="editingNickname = true">
                编辑
              </Button>
            </div>
            <Form
              v-else
              ref="profileFormRef"
              class="inline-form nickname-form"
              layout="vertical"
              :model="profileForm"
            >
              <FormItem
                name="nickname"
                :rules="[
                  { required: true, message: '请输入账号昵称' },
                  { min: 1, max: 20, message: '昵称长度应在1到20之间' },
                ]"
              >
                <Input
                  v-model:value="profileForm.nickname"
                  placeholder="请输入账号昵称"
                  allow-clear
                  :maxlength="20"
                />
              </FormItem>
              <Button @click="cancelEditNickname">取消</Button>
              <Button type="primary" :loading="profileLoading" @click="saveProfile">保存</Button>
            </Form>
          </div>

          <div class="settings-field">
            <div class="field-label required">账号密码</div>
            <div v-if="!editingPassword" class="field-display">
              <span>已设置</span>
              <Button type="link" class="inline-action" @click="editingPassword = true">
                编辑
              </Button>
            </div>
            <Form
              v-else
              ref="passwordFormRef"
              class="inline-form password-form"
              layout="vertical"
              :model="passwordForm"
              :rules="passwordRules"
            >
              <input class="hidden-username" autocomplete="username" :value="accountName" readonly />
              <FormItem name="currentPassword">
                <InputPassword
                  v-model:value="passwordForm.currentPassword"
                  placeholder="请输入原密码"
                  autocomplete="current-password"
                />
              </FormItem>
              <FormItem name="newPassword">
                <InputPassword
                  v-model:value="passwordForm.newPassword"
                  placeholder="请输入新密码"
                  autocomplete="new-password"
                />
              </FormItem>
              <FormItem name="confirmPassword">
                <InputPassword
                  v-model:value="passwordForm.confirmPassword"
                  placeholder="请再次输入新密码"
                  autocomplete="new-password"
                />
              </FormItem>
              <div class="password-actions">
                <Button @click="cancelEditPassword">取消</Button>
                <Button type="primary" :loading="passwordLoading" @click="changePassword">
                  保存
                </Button>
              </div>
            </Form>
          </div>

          <div class="settings-field">
            <div class="field-label">绑定邮箱</div>
            <div class="field-display muted">{{ accountName }}</div>
          </div>
        </main>
      </div>
    </AppModal>
  </div>
</template>

<style scoped lang="scss">
@use './SideBar.scss';
</style>
