; Inno Setup Script for AI Novel Video Generator
; Requires Inno Setup 6+: https://jrsoftware.org/isinfo.php
; Compile: Open this file in Inno Setup Compiler and press Build

#define AppName "AI Novel Video Generator"
#define AppVersion "1.0.0"
#define AppPublisher "AI Novel"
#define AppExeName "AINovelVideoGenerator.exe"
#define AppId "{{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir=.
OutputBaseFilename=AINovelVideoGenerator-Setup
SetupIconFile=
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
; Require at least Windows 10
MinVersion=10.0
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
; Copy the entire PyInstaller output directory
Source: "..\dist\AINovelVideoGenerator\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove user data dir only if user confirms — we don't auto-delete AppData
Type: filesandordirs; Name: "{app}"

[Code]
// Show a message reminding users where their data is stored
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssDone then begin
    MsgBox('Installation complete!' + #13#10 + #13#10 +
           'Your novels and settings will be saved to:' + #13#10 +
           '  %APPDATA%\AINovelVideoGenerator\  (settings)' + #13#10 +
           '  Documents\AI小说项目\  (your projects)' + #13#10 + #13#10 +
           'Click OK to finish.',
           mbInformation, MB_OK);
  end;
end;
