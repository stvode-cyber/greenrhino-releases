# TWA 默认保留规则
-keep class androidx.browser.trusted.** { *; }
# Trusted Web Activity 启动器/服务（由 manifest 字符串引用，R8 不会追踪，需显式保留）
-keep class com.google.androidbrowserhelper.trusted.** { *; }

# 🔶 ISS-20261009-019: 保留所有 Log 调用便于调试（防止 R8 优化掉诊断日志）
-keep class android.util.Log { *; }
-keep class com.greenrhino.music.** { *; }
-keep class com.greenrhino.music.MainActivity { *; }
-keepclassmembers class com.greenrhino.music.RhinoBridge { *; }
