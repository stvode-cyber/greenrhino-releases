# TWA 默认保留规则
-keep class androidx.browser.trusted.** { *; }
# Trusted Web Activity 启动器/服务（由 manifest 字符串引用，R8 不会追踪，需显式保留）
-keep class com.google.androidbrowserhelper.trusted.** { *; }
