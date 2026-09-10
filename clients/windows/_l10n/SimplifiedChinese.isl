; Simplified Chinese (简体中文) 语言文件 —— GreenRhino 自备精简版
; 覆盖 Inno Setup 向导核心界面文案；未覆盖键自动回退英文默认。

[LangOptions]
LanguageName=简体中文
LanguageID=$0804
LanguageCodePage=65001
DialogFontName=Microsoft YaHei
DialogFontSize=9

[Messages]
; ---- 主窗口标题 / 欢迎页 ----
SetupWindowTitle=安装 - %1
SetupAppTitle=安装
WelcomeLabel1=欢迎使用 %1 安装向导
WelcomeLabel2=本向导将引导您完成 %1 的安装。%n%n建议在继续前关闭所有正在运行的 %1 实例。

; ---- 按钮 ----
ButtonBack=上一步(&B)
ButtonNext=下一步(&N) >
ButtonInstall=安装(&I)
ButtonFinish=完成(&F)
ButtonCancel=取消(&C)
ButtonYes=是(&Y)
ButtonNo=否(&N)
ButtonBrowse=浏览(&R)...
ButtonWizardBrowse=浏览(&R)...
ButtonNewFolder=新建文件夹(&M)
ButtonWizardUninstall=卸载

; ---- 目录选择页 ----
SelectDirTitle=选择安装位置
SelectDirLabel3=安装程序将把 %1 安装到以下文件夹中。
SelectDirBrowseLabel=点击「下一步」继续，或点击「浏览」选择其他文件夹。
SelectDirExistingLabel3=目标文件夹:
SelectDirInstallLabel=安装程序将把 %1 安装到以下文件夹。
WizardSelectDir=选择安装位置
WizardSelectDirDescription=选择安装 %1 的文件夹。

; ---- 开始菜单页 ----
SelectStartMenuFolderTitle=选择开始菜单文件夹
SelectStartMenuFolderLabel=选择要在开始菜单中创建程序快捷方式的文件夹。
SelectStartMenuFolderBrowseLabel=点击「下一步」继续。
WizardSelectProgramGroup=选择开始菜单文件夹
WizardSelectProgramGroupDescription=选择要放置程序快捷方式的文件夹。

; ---- 附加任务页 ----
SelectTasksTitle=选择附加任务
SelectTasksLabel2=选择要随 %1 一起执行的附加任务，然后点击「下一步」。
WizardSelectTasks=选择附加任务
WizardSelectTasksDescription=要安装哪些附加组件？
CreateDesktopIcon=创建桌面快捷方式
AdditionalIcons=创建开始菜单快捷方式

; ---- 准备安装 / 安装过程 ----
ReadyLabel1=安装程序已准备就绪，即将开始安装 %1。
ReadyLabel2a=点击「安装」开始安装。
ReadyLabel2b=点击「安装」继续安装。
ReadyMemoUserInfo=用户信息:
ReadyMemoDir=安装位置:
ReadyMemoType=安装类型:
ReadyMemoComponents=所选组件:
ReadyMemoGroup=开始菜单文件夹:
ReadyMemoTasks=附加任务:
WizardReady=准备安装
WizardReadyDescription=准备安装 %1。

InstallingLabel=正在安装 %1，请稍候...
WizardInstalling=正在安装
WizardInstallingDescription=正在安装 %1。
SetupInstalled=%1 安装已完成。
ClickFinishToExitSetup=点击「完成」退出安装程序。

; ---- 正在完成 ----
FinishedHeadingLabel=正在完成 %1 安装向导
FinishedLabel=%1 已成功安装到您的计算机。%n%n点击「完成」退出安装向导。
FinishedLabelNoIcons=%1 已成功安装到您的计算机。%n%n点击「完成」退出安装向导。
WizardFinished=正在完成安装向导
WizardFinishedDescription=%1 安装向导已完成。

; ---- 卸载相关 ----
UninstallAppFullTitle=卸载 %1
UninstallAppTitle=卸载
ConfirmUninstall=确定要完全卸载 %1 及其全部组件吗？
UninstallStatusLabel=正在从您的计算机卸载 %1...
UninstallStatusLabelNoPercent=正在从您的计算机卸载 %1...
UninstalledAll=%1 已成功从您的计算机移除。
UninstallProgramFiles=删除应用程序文件
UninstallRegistry=删除注册表项
UninstallUserInfo=删除用户信息
UninstallApplications=删除应用程序目录
UninstallFilesAndRegistry=删除应用程序文件和注册表项
UninstallAppAndConfirmation=卸载前请确认您确实要移除 %1。
UninstallDataFile=卸载数据文件
WizardUninstalling=正在卸载

; ---- 启动程序 ----
LaunchProgram=%1 正在启动...
LaunchProgramError=无法启动 %1。%n%n错误: %2

; ---- 错误/消息 ----
ErrorReadingSetup=读取安装数据时出错。
ErrorInternal=内部错误。
ErrorOpeningFile=无法打开文件 %1。
ErrorNotEnoughSpace=磁盘空间不足，无法安装。
ErrorFilesInUse=以下文件正在使用中，安装程序需要关闭它们才能继续:%n%n%1%n%n请关闭这些应用程序后重试。
ErrorFileAlreadyExists=文件 %1 已存在。
ErrorCreateTempFile=创建临时文件时出错。
ErrorDiskNotEnoughSpace=磁盘空间不足。
ErrorRestartingComputer=无法重启计算机。
ErrorRunningApp=运行 %1 时出错。
ErrorTooManyFilesInUse=有文件被占用，无法继续。
ExitSetupMessage=%1 尚未安装完成。%n%n确定要退出安装程序吗？
ExitSetupTitle=退出安装程序

; ---- 常见通用 ----
ClickNext=点击「下一步」继续。
ClickInstall=点击「安装」开始安装。
ReadyToInstall=安装程序准备就绪。
BeveledLabel=绿色犀牛团队

[CustomMessages]
CreateDesktopIcon=创建桌面快捷方式(&D)
AdditionalIcons=创建开始菜单快捷方式
LaunchProgram=运行 %1