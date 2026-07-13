<script setup lang="ts">
import { LockKeyhole, UserRound } from '@lucide/vue'
import { Button, Card, Form, FormItem, Input, InputPassword } from 'antdv-next'
import { reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const formModel = reactive({
  username: '',
  password: '',
})

function submit() {
  authStore.authLogin({
    username: formModel.username,
    password: formModel.password,
  })
}
</script>

<template>
  <div class="login">
    <Card class="login-card" variant="borderless">
      <div class="brand">
        <img class="brand-logo" src="@/assets/images/logo.png" alt="" />
        <div>
          <div class="brand-title">苏应智汇港</div>
          <div class="brand-desc">统一身份认证</div>
        </div>
      </div>

      <section class="welcome" aria-labelledby="login-title">
        <h1 id="login-title" class="welcome-title">欢迎登录</h1>
        <p class="welcome-desc">使用您的账号进入智能应用工作台</p>
      </section>

      <Form
        class="login-form"
        layout="vertical"
        :model="formModel"
        autocomplete="on"
        @finish="submit"
      >
        <FormItem
          label="用户名"
          name="username"
          :rules="[{ required: true, message: '请输入用户名' }]"
        >
          <Input
            v-model:value="formModel.username"
            placeholder="请输入用户名"
            autocomplete="username"
            allow-clear
          >
            <template #prefix>
              <UserRound class="field-icon" />
            </template>
          </Input>
        </FormItem>

        <FormItem label="密码" name="password" :rules="[{ required: true, message: '请输入密码' }]">
          <InputPassword
            v-model:value="formModel.password"
            placeholder="请输入密码"
            autocomplete="current-password"
          >
            <template #prefix>
              <LockKeyhole class="field-icon" />
            </template>
          </InputPassword>
        </FormItem>

        <FormItem class="submit-item">
          <Button class="login-button" type="primary" html-type="submit" block>登录</Button>
        </FormItem>
      </Form>

      <div class="school-name">苏州大学应用技术学院</div>
    </Card>
  </div>
</template>

<style scoped lang="scss">
.login {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  padding: 9.5rem 2.4rem 4rem;
  background: url('@/assets/images/background.png') center / cover no-repeat;
}

.login-card {
  width: min(100%, 40rem);
  box-shadow: 0 2rem 5rem rgb(17 24 39 / 14%);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 2.4rem;
}

.brand-logo {
  width: 4rem;
  height: 4rem;
  object-fit: contain;
}

.brand-title {
  line-height: 2.4rem;
  font-size: 2rem;
  font-weight: 700;
  color: var(--font-active-color);
}

.brand-desc {
  margin-top: 0.2rem;
  line-height: 1.8rem;
  font-size: 1.2rem;
  color: var(--font-light-color);
}

.welcome {
  margin-bottom: 2.4rem;
}

.welcome-title {
  margin: 0;
  font-size: 2.8rem;
  font-weight: 700;
  color: var(--font-active-color);
}

.welcome-desc {
  margin-top: 0.8rem;
  font-size: 1.4rem;
  color: var(--font-light-color);
}

.field-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--font-light-color);
}

.login-button {
  font-size: 1.4rem;
  font-weight: 600;
}

.school-name {
  margin-top: 2.4rem;
  padding-top: 0.8rem;
  border-top: 0.1rem solid var(--border-color);
  text-align: center;
  font-size: 1.2rem;
  color: var(--font-light-color);
}
</style>
