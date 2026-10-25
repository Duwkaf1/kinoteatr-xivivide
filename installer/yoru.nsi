Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

Name "Yoru"
Caption "Установка Yoru"
UninstallCaption "Удаление Yoru"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Yoru"
InstallDirRegKey HKCU "Software\Yoru" "InstallDir"
RequestExecutionLevel user
ManifestDPIAware true
ManifestSupportedOS Win10
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "Yoru · личный кинозал"
Icon "${ICON}"
UninstallIcon "${ICON}"
ShowInstDetails nevershow
ShowUninstDetails nevershow
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1049 "ProductName" "Yoru"
VIAddVersionKey /LANG=1049 "FileDescription" "Установка Yoru"
VIAddVersionKey /LANG=1049 "CompanyName" "Duwkaf1"
VIAddVersionKey /LANG=1049 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1049 "LegalCopyright" "Yoru contributors"

!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Yoru"
!define MUI_ABORTWARNING
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
Var DesktopShortcut
Var LaunchCheckbox
Var Dialog
Var HeadingFont
Var IconHandle
Var PurgeUserData
Var UninstallDescription


Page custom WelcomePage WelcomeLeave
!insertmacro MUI_PAGE_INSTFILES
Page custom FinishPage FinishLeave
!define MUI_UNCONFIRMPAGE_TEXT_TOP "$UninstallDescription"
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"


Function .onInit
  ; Move directly from completed extraction to our custom finish page, matching
  ; the behavior normally configured by MUI_PAGE_FINISH.
  SetAutoClose true
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Для Yoru нужна 64-разрядная Windows 10 или 11."
    SetErrorLevel 1
    Quit
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "Для Yoru нужна Windows 10 или 11."
    SetErrorLevel 1
    Quit
  ${EndIf}
  SetRegView 64
  SetShellVarContext current
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=yoru.ico "${ICON}"
  StrCpy $DesktopShortcut ${BST_CHECKED}
FunctionEnd

Function WelcomePage
  !insertmacro MUI_HEADER_TEXT "Твой кинозал — рядом" "Установка Yoru ${VERSION}"
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${NSD_CreateIcon} 0 0 32u 32u ""
  Pop $0
  ${NSD_SetIcon} $0 "$PLUGINSDIR\yoru.ico" $IconHandle
  ${NSD_CreateLabel} 44u 1u 240u 26u "Yoru"
  Pop $0
  CreateFont $HeadingFont "Segoe UI" 22 600
  SendMessage $0 ${WM_SETFONT} $HeadingFont 1
  ${NSD_CreateLabel} 44u 29u 240u 16u "Аниме, к которому хочется вернуться."
  Pop $0
  ${NSD_CreateLabel} 0 57u 100% 34u "Всё необходимое уже внутри. Установка доступна без прав администратора.$\r$\nБиблиотека, темы и заметки прежней версии сохранятся."
  Pop $0
  ${NSD_CreateCheckbox} 0 103u 100% 16u "Добавить ярлык на рабочий стол"
  Pop $DesktopShortcut
  ${NSD_Check} $DesktopShortcut
  ${NSD_CreateLabel} 0 133u 100% 30u "Каталог, поиск по жанрам и возрасту, случайное аниме и продолжение просмотра."
  Pop $0
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Установить"
  nsDialogs::Show
  ${NSD_FreeIcon} $IconHandle
  System::Call 'gdi32::DeleteObject(p $HeadingFont)'
FunctionEnd

Function WelcomeLeave
  ${NSD_GetState} $DesktopShortcut $DesktopShortcut
FunctionEnd

Function FinishPage
  !insertmacro MUI_HEADER_TEXT "Готово. Хорошего просмотра" "Yoru установлен"
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 8u 100% 28u "Приложение уже в меню «Пуск». Удалить его можно в настройках Yoru или Windows."
  Pop $0
  ${NSD_CreateCheckbox} 0 54u 100% 18u "Открыть Yoru"
  Pop $LaunchCheckbox
  ${NSD_Check} $LaunchCheckbox
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Готово"
  GetDlgItem $0 $HWNDPARENT 3
  EnableWindow $0 0
  GetDlgItem $0 $HWNDPARENT 2
  EnableWindow $0 0
  nsDialogs::Show
FunctionEnd

Function FinishLeave
  ${NSD_GetState} $LaunchCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    ExecShell "open" "$INSTDIR\Yoru.exe"
  ${EndIf}
FunctionEnd

; Do not terminate playback or overwrite an executable in use. Silent calls fail
; with a nonzero exit code; interactive calls let the user close Yoru and retry.
!macro CHECK_CLOSED PREFIX
Function ${PREFIX}CheckClosed
retry:
  IfFileExists "$INSTDIR\Yoru.exe" 0 done
  System::Call 'kernel32::CreateFileW(w "$INSTDIR\Yoru.exe", i 0x40000000, i 7, p 0, i 3, i 0, p 0) p.r0'
  IntCmp $0 -1 locked
  System::Call 'kernel32::CloseHandle(p r0)'
  Goto done
locked:
  IfSilent silent
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Закрой Yoru перед продолжением. Если окно уже закрыто, проверь доступ к папке приложения." IDRETRY retry
silent:
  SetErrorLevel 2
  Quit
done:
FunctionEnd
!macroend
!insertmacro CHECK_CLOSED ""
!insertmacro CHECK_CLOSED "un."

Section "Yoru"
  Call CheckClosed
  SetOutPath "$INSTDIR"
  SetOverwrite on
  File /r "${APP_DIR}\*"
  WriteUninstaller "$INSTDIR\Uninstall Yoru.exe"
  FileOpen $0 "$INSTDIR\yoru-install.json" w
  FileWrite $0 '{$\"fullUninstall$\":true,$\"version$\":$\"${VERSION}$\"}'
  FileClose $0
  CreateDirectory "$SMPROGRAMS\Yoru"
  CreateShortcut "$SMPROGRAMS\Yoru\Yoru.lnk" "$INSTDIR\Yoru.exe" "" "$INSTDIR\Yoru.exe" 0
  ${If} $DesktopShortcut == ${BST_CHECKED}
    CreateShortcut "$DESKTOP\Yoru.lnk" "$INSTDIR\Yoru.exe" "" "$INSTDIR\Yoru.exe" 0
  ${EndIf}
  WriteRegStr HKCU "Software\Yoru" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "Yoru"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Duwkaf1"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" '$\"$INSTDIR\Yoru.exe$\",0'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall Yoru.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall Yoru.exe$\" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" ${SIZE_KB}
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext current
  StrCpy $PurgeUserData 0
  StrCpy $UninstallDescription "Yoru будет удалён. Библиотека, история, темы и заметки останутся на этом компьютере."
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/PURGEUSERDATA" $1
  ${IfNot} ${Errors}
    StrCpy $PurgeUserData 1
    StrCpy $UninstallDescription "Yoru и все его данные будут удалены: библиотека, история, темы, заметки и кэш. Восстановить их нельзя."
  ${EndIf}
  ClearErrors
  ${GetOptions} $0 "/WAITPID=" $1
  ${IfNot} ${Errors}
    System::Call 'kernel32::OpenProcess(i 0x100000, i 0, i r1) p.r2'
    ${If} $2 != 0
      System::Call 'kernel32::WaitForSingleObject(p r2, i 30000) i.r3'
      System::Call 'kernel32::CloseHandle(p r2)'
      ${If} $3 != 0
        SetErrorLevel 2
        Quit
      ${EndIf}
    ${EndIf}
  ${EndIf}
FunctionEnd

; Remove only the fixed Yoru profile. Reparse points are removed as links and
; never traversed, including a junction at the profile root itself.
Function un.RemoveProfileTree
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r3'
  IntOp $4 $3 & 0x400
  ${If} $4 != 0
    RMDir "$0"
    Delete "$0"
    Goto profile_done
  ${EndIf}
  FindFirst $1 $2 "$0\*.*"
profile_next:
  ${If} $2 == ""
    Goto profile_close
  ${EndIf}
  ${If} $2 != "."
  ${AndIf} $2 != ".."
    System::Call 'kernel32::GetFileAttributesW(w "$0\$2") i.r3'
    IntOp $4 $3 & 0x400
    ${If} $4 != 0
      RMDir "$0\$2"
      Delete "$0\$2"
    ${Else}
      IntOp $4 $3 & 0x10
      ${If} $4 != 0
        Push "$0\$2"
        Call un.RemoveProfileTree
      ${Else}
        SetFileAttributes "$0\$2" NORMAL
        Delete "$0\$2"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  FindNext $1 $2
  Goto profile_next
profile_close:
  FindClose $1
  RMDir "$0"
profile_done:
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Section "Uninstall"
  Call un.CheckClosed
  !include /CHARSET=UTF8 "${UNINSTALL_FILES}"
  Delete "$INSTDIR\Uninstall Yoru.exe"
  Delete "$INSTDIR\yoru-install.json"
  Delete "$DESKTOP\Yoru.lnk"
  Delete "$SMPROGRAMS\Yoru\Yoru.lnk"
  RMDir "$SMPROGRAMS\Yoru"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\Yoru"
  ${If} $PurgeUserData == 1
    Push "$APPDATA\kadr-anime"
    Call un.RemoveProfileTree
    IfFileExists "$APPDATA\kadr-anime\*.*" 0 profile_removed
    SetErrorLevel 3
profile_removed:
  ${EndIf}
  ; Standard Windows uninstall preserves the profile; the in-app action opts in.
  RMDir "$INSTDIR"
SectionEnd
