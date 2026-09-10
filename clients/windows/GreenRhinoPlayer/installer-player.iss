#define MyAppName "绿角犀播放器"
#define MyAppNameEn "GreenRhinoPlayer"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "GreenRhino"
#define MyAppExe "GreenRhinoPlayer.exe"

[Setup]
AppId={{1F7D3B5A-6C2E-4E8F-9B1D-4A2C9E7F8B03}
AppName={#MyAppNameEn}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\GreenRhino\{#MyAppNameEn}
DefaultGroupName=绿角犀
DisableProgramGroupPage=yes
OutputDir=d:\源码存档\音乐影视播放器\dist
OutputBaseFilename=GreenRhinoPlayer-setup-v16
Compression=lzma2
SolidCompression=yes
SetupIconFile=d:\源码存档\音乐影视播放器\clients\windows\GreenRhinoPlayer\icon.ico
UninstallDisplayIcon={app}\{#MyAppExe}
VersionInfoVersion={#MyAppVersion}
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "chinesesimplified"; MessagesFile: "D:\源码存档\音乐影视播放器\clients\windows\_l10n\SimplifiedChinese.isl"

[Files]
Source: "d:\源码存档\音乐影视播放器\clients\windows\GreenRhinoPlayer\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent