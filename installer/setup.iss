; Inno Setup Script: CastDeck Setup Wizard
; Packages the standalone CastDeck.exe binary + optional ffmpeg.exe / yt-dlp.exe sidecars.

#define MyAppName "CastDeck"
#define MyAppShortName "CastDeck"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "oktaa"
#define MyAppURL "https://hi.oktaa.my.id"
#define MyAppExeName "CastDeck.exe"

#ifndef AppArch
#define AppArch "x64"
#endif

[Setup]
AppId={{D37F27B8-9A8C-4C8E-BF8E-927A1E11D328}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
#if AppArch == "x64"
ArchitecturesInstallIn64BitMode=x64compatible
DefaultDirName={autopf}\{#MyAppName}
#else
DefaultDirName={autopf32}\{#MyAppName}
#endif
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist
OutputBaseFilename=CastDeck-Setup-{#AppArch}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=yes
RestartApplications=no
DisableProgramGroupPage=yes
SetupIconFile=..\assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; Clean up legacy executable & shortcuts from pre-CastDeck releases
Type: files; Name: "{app}\RCBStudio.exe"
Type: files; Name: "{app}\RadioBOSSCaster.exe"
Type: files; Name: "{autodesktop}\RCB Studio.lnk"
Type: files; Name: "{autodesktop}\Radio Caster Bridge.lnk"
Type: files; Name: "{autodesktop}\Radio Caster Bridge Studio.lnk"
Type: filesandordirs; Name: "{group}\..\Radio Caster Bridge Studio"
Type: filesandordirs; Name: "{group}\..\Radio Caster Bridge"
Type: files; Name: "{commonprograms}\Radio Caster Bridge Studio.lnk"
Type: files; Name: "{commonprograms}\Radio Caster Bridge.lnk"
Type: files; Name: "{userprograms}\Radio Caster Bridge Studio.lnk"
Type: files; Name: "{userprograms}\Radio Caster Bridge.lnk"

[Files]
Source: "..\dist\CastDeck.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\ffmpeg.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\dist\yt-dlp.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppShortName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent runasoriginaluser
