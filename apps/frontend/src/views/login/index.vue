<script setup lang="ts">
import { Card, Form, Input, Button, FormItem } from 'antdv-next'
import { reactive } from 'vue'
const model = reactive({
  username: '',
  password: '',
})
const submit = () => {
  console.log('submit', model)
}
</script>

<template>
  <div class="login">
    <Card class="login-card">
      <div class="logo_name">
        <img src="@/assets/images/logo.png" width="100" height="100" />
        <div class="name">
          <div class="title">苏应智汇港</div>
          <div class="desc">统一身份认证</div>
        </div>
      </div>
      <div class="welcome">
        <div class="title">欢迎登录</div>
        <div class="desc">使用您的账号进入智能应用工作台</div>
      </div>
      <Form layout="vertical" :model="model" @finish="submit">
        <FormItem
          label="用户名"
          name="username"
          :rules="[{ required: true, message: '请输入用户名' }]"
          v-model:value="model.username"
        >
          <Input placeholder="请输入用户名" />
        </FormItem>
        <FormItem
          label="密码"
          name="password"
          :rules="[{ required: true, message: '请输入密码' }]"
          v-model:value="model.password"
        >
          <Input type="password" placeholder="请输入密码" />
        </FormItem>
        <FormItem>
          <Button type="primary" htmlType="submit">登录</Button>
        </FormItem>
      </Form>
    </Card>
  </div>
</template>

<style scoped lang="scss">
.login {
  width: 100vw;
  height: 100vh;
  background-image: url('@/assets/images/background.png');
  background-size: cover;
  display: flex;
  justify-content: center;
  align-items: center;
  .login-card {
    width: 25vw;
    max-width: 45rem;
    box-shadow: 0 1.5rem 4rem #1118272e;
  }
}
</style>
