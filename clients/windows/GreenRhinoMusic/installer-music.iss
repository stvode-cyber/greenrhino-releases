#define MyAppName "绿角犀音乐"
#define MyAppNameEn "GreenRhinoMusic"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "GreenRhino"
#define MyAppExe "GreenRhinoMusic.exe"

[Setup]
AppId={{8E4B2C10-5A3F-4E6D-8A9B-2C7D0F1E3A56}
AppName={#MyAppNameEn}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\GreenRhino\{#MyAppNameEn}
DefaultGroupName=绿角犀
DisableProgramGroupPage=yes
OutputDir=d:\源码存档\音乐影视播放器\dist
OutputBaseFilename=GreenRhinoMusic-setup-v16
Compression=lzma2
SolidCompression=yes
SetupIconFile=d:\源码存档\音乐影视播放器\clients\windows\GreenRhinoMusic\icon.ico
UninstallDisplayIcon={app}\{#MyAppExe}
VersionInfoVersion={#MyAppVersion}
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "chinesesimplified"; MessagesFile: "D:\源码存档\音乐影视播放器\clients\windows\_l10n\SimplifiedChinese.isl"

[Files]
Source: "d:\源码存档\音乐影视播放器\clients\windows\GreenRhinoMusic\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent