# adb -s {device} install {flags} {apk}
> 将本地 APK 文件安装到指定 Android 设备上。

## 1. 命令简介 (Introduction)  
`adb install` 是 Android Debug Bridge（ADB）提供的用于把本机的 APK 包推送并安装到已连接的 Android 设备（或模拟器）上的命令。配合 `-s {device}` 参数可以明确指定目标设备，适用于多设备同时连接的调试场景。常用于开发者快速验证新版本、测试内部渠道包或在没有 UI 的环境下批量部署应用。

## 2. 语法与参数 (Syntax & Parameters)  

```
adb -s <device> install [options] <apk_path>
```

| 参数 | 说明 | 备注 |
|------|------|------|
| `-s <device>` | 指定目标设备的序列号（`adb devices` 可查看） | 必须在多设备连接时使用，单设备可省略 `-s` |
| `-r` | 重新安装（replace），保留原有数据和缓存 | 常用于升级调试版 |
| `-t` | 允许安装测试（test）APK，即 `android:testOnly="true"` 的包 | 仅在调试阶段使用 |
| `-d` | 允许降级安装（downgrade），即版本号低于已装版本 | 需要设备开启 **允许降级** 选项 |
| `-g` | 安装后自动授予所有运行时权限（runtime permissions） | 省去手动弹窗确认 |
| `-l` | 前向锁定（forward‑lock）安装，仅限系统内部使用，普通用户不常用 | 需要系统签名 |
| `-p <path>` | 指定安装路径（如 `/data/app`、`/system/priv-app`） | 需要设备 root 权限 |
| `-s` | 将 APK 安装到共享存储（SD 卡） | 仅在设备支持时有效 |
| `-b <apk>` | 安装分割 APK（split APK）时使用，后接 `-b` 多次 | 适用于 Android App Bundle |
| `-a` | 允许所有用户（all users）安装 | 需要系统权限 |

> **组合使用示例**：`adb -s emulator-5554 install -r -g myapp.apk`  
> 这条命令在指定的模拟器上重新安装 `myapp.apk`，并自动授予所有运行时权限。

## 3. 常见用法与示例 (Common Use Cases & Examples)

| 示例 | 命令 | 说明 |
|------|------|------|
| **1. 基本安装** | `adb -s 0123456789ABCDEF install /path/to/app.apk` | 将 `app.apk` 安装到序列号为 `0123456789ABCDEF` 的设备。 |
| **2. 重新安装并保留数据** | `adb -s emulator-5554 install -r /sdcard/debug/app-debug.apk` | 在模拟器上覆盖安装调试包，保留原有数据和缓存。 |
| **3. 允许降级安装** | `adb -s device123 install -d /tmp/old_version.apk` | 当设备已有更高版本时，强制安装旧版 APK（需开启“允许降级”。） |
| **4. 安装测试包并自动授予权限** | `adb -s 192.168.0.101:5555 install -t -g /data/local/tmp/test.apk` | 对标记为 `testOnly` 的 APK 进行安装，并一次性授予所有运行时权限。 |
| **5. 指定安装路径（需要 root）** | `adb -s myPhoneRoot install -p /system/priv-app /tmp/priv.apk` | 将 `priv.apk` 安装到系统私有目录，仅在已 root 的设备上可用。 |

## 4. 注意事项 (Notes/Gotchas)

1. **设备状态**  
   - 确保目标设备已开启 **USB 调试**，并在 `adb devices` 中显示为 `device`（而非 `offline`）。  
   - 多设备同时连接时，务必使用 `-s <device>` 明确指定，否则默认使用列表中的第一个设备。

2. **APK 路径**  
   - `adb install` 只能接受本机文件路径，若路径中含有空格，请使用引号包裹（如 `"C:\My Apps\app.apk"`）。  
   - 对于大文件，建议先使用 `adb push` 将 APK 复制到设备临时目录，再执行 `adb install /data/local/tmp/app.apk`，可以避免传输中断。

3. **签名与权限**  
   - 若安装的 APK 与系统已有同名包签名不一致，会出现 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`。  
   - 使用 `-g` 授予运行时权限时，仍可能因 **目标 SDK** 过高而被系统限制，需检查 `targetSdkVersion` 与设备系统版本的兼容性。

4. **降级与测试**  
   - `-d`（降级）和 `-t`（测试）在 Android 8.0 以后默认被禁用，需在 **开发者选项** 中打开 **“允许安装未知来源的应用”** 与 **“允许降级”**。  
   - 部分厂商系统（如华为、三星）会有额外的安全弹窗，可能需要手动确认。

5. **分割 APK（Split APK）**  
   - 对于使用 Android App Bundle（.aab）生成的多个 `.apk`（base + config），需要使用 `adb install-multiple` 或多次 `-b` 参数组合。  
   - 示例：`adb install-multiple -r -t base.apk config.en.apk config.xxhdpi.apk`

6. **错误排查**  
   - 常见错误码及含义：  
     - `INSTALL_FAILED_INSUFFICIENT_STORAGE` → 设备存储不足，清理后重试。  
     - `INSTALL_PARSE_FAILED_NO_CERTIFICATES` → APK 未签名或签名损坏。  
     - `INSTALL_FAILED_OLDER_SDK` → APK 的 `minSdkVersion` 高于设备系统版本。  

7. **自动化脚本**  
   - 在 CI/CD 流程中使用 `adb install` 时，建议加入超时检测与返回码判断：  
     ```sh
     if adb -s $DEVICE install -r $APK; then
         echo "安装成功"
     else
         echo "安装失败，退出码 $?"
         exit 1
     fi
     ```

> **小技巧**：使用 `adb logcat` 实时观察安装过程的日志，可快速定位 `INSTALL_FAILED_*` 的具体原因。