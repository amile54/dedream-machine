# 拆梦机器 — 打包与分发指南

本文档详细说明如何将「拆梦机器」打包成安装文件，并分发给同事使用。

---

## 一、直接分发已有的 macOS 安装包

如果您的同事使用的是 **Apple M 芯片的 Mac**（M1/M2/M3/M4，即 2020 年底之后购买的 Mac），可直接分发已构建好的安装包：

```
dedream_machine/src-tauri/target/release/bundle/dmg/DeDream Machine_0.1.0_aarch64.dmg
```

**同事的安装步骤：**
1. 双击打开 `.dmg` 文件
2. 将「拆梦机器」图标拖入 Applications 文件夹
3. 首次打开时，macOS 可能提示"无法验证开发者"，此时前往 **系统设置 → 隐私与安全性**，点击"仍要打开"即可

---

## 二、通过 GitHub Actions 云端打包（推荐）

此方案可以同时生成 **macOS** 和 **Windows** 安装包，无需在 Windows 电脑上安装任何开发环境。

### 前置准备（仅需一次）

1. 注册一个 [GitHub](https://github.com) 账号（如已有可跳过）
2. 在 GitHub 上新建一个仓库：
   - 点击右上角 `+` → `New repository`
   - 名称填 `dedream-machine`
   - 可以选择 **Private**（私有仓库）
   - **不要**勾选 "Add a README file"
   - 点击 `Create repository`

### 推送代码到 GitHub

在您这台 Mac 上打开「终端」，依次执行以下命令：

```bash
# 进入项目目录
cd ~/Documents/dedream_machine

# 初始化 Git 仓库
git init

# 添加所有文件（大体积的二进制文件已被 .gitignore 排除）
git add .

# 提交代码
git commit -m "v0.1.0 拆梦机器 初始版本"

# 关联到您刚才创建的 GitHub 仓库（把 YOUR_USERNAME 替换成您的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/dedream-machine.git

# 推送
git push -u origin main
```

> **注意**：如果提示输入密码，GitHub 现在不再接受密码登录。请前往 GitHub → Settings → Developer settings → Personal access tokens → 生成一个 Token，用 Token 替代密码输入。

### 触发云端打包

1. 在浏览器中打开您的 GitHub 仓库页面
2. 点击顶部的 **Actions** 标签页
3. 左侧列表中选择 **Build & Release**
4. 点击右侧的 **Run workflow** → **Run workflow**（绿色按钮）
5. 等待 10~15 分钟，两个任务都变成 ✅ 绿色勾之后就完成了

### 下载安装包

1. 点击刚才那次运行记录（绿色勾的那行）
2. 滚动到页面最底部的 **Artifacts** 区域
3. 您会看到两个下载项：
   - `DeDream-Machine-macOS-ARM` → 里面是 `.dmg`（给 Mac 同事）
   - `DeDream-Machine-Windows-x64` → 里面是 `.exe`（给 Windows 同事）
4. 点击即可下载，然后通过飞书/微信发给同事

---

## 三、同事使用说明

### Mac 用户
1. 双击 `.dmg` → 拖放到 **Applications（应用程序）** 文件夹
2. 从启动台（Launchpad）打开「拆梦机器」
3. **⚠️ 常见错误提示（文件已损坏）：**
   如果您并没有购买苹果的开发者证书进行签名，发给同事的 App 被他们从网上下载后，macOS 的「门禁系统 (Gatekeeper)」会为了安全起见给它打上隔离标签，并弹窗提示：**“文件已损坏，打不开。您应该将它移到废纸篓。”**
   **解决办法**：让同事打开 Mac 自带的「终端」应用，复制粘贴以下命令并回车（可能需要输入开机密码）：
   ```bash
   sudo xattr -rd com.apple.quarantine "/Applications/DeDream Machine.app"
   ```
   执行完后，再次双击打开 App 就可以完美运行了！

### Windows 用户
1. 双击 `.exe` 安装包 → 按提示安装
2. Windows Defender 可能会弹出蓝色警告窗口"Windows 已保护你的电脑"
3. 点击 **更多信息** → **仍要运行** 即可

### 打开工作目录
安装完成后，打开软件，选择「打开工作目录」，导航到存有视频素材和 `project.json` 的文件夹即可开始工作。

---

## 四、后续版本更新

当代码有修改需要发布新版本时：

```bash
cd ~/Documents/dedream_machine
git add .
git commit -m "更新说明"
git push
```

然后再去 GitHub Actions 页面点一次 **Run workflow**，等它跑完下载新的安装包即可。

---

## 五、硬件要求

| 平台 | 最低要求 |
|------|---------|
| macOS | Apple Silicon (M1/M2/M3/M4) 芯片，macOS 12+ |
| Windows | 64 位系统，Windows 10 或更高 |
| 通用 | 至少 4GB 可用内存 |
