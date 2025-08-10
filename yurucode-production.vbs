' yurucode Production Launcher
' Starts the built yurucode.exe application

Option Explicit

Dim objShell, objFSO, strPath, strExePath

' Create objects
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get script directory
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Build exe path
strExePath = strPath & "\release\win-unpacked\yurucode.exe"

' Check if exe exists
If Not objFSO.FileExists(strExePath) Then
    ' Try alternate location (if script is in release folder)
    strExePath = strPath & "\yurucode.exe"
    
    If Not objFSO.FileExists(strExePath) Then
        MsgBox "Error: yurucode.exe not found!" & vbCrLf & _
               "Please build the application first:" & vbCrLf & _
               "Run build-win.bat", _
               vbCritical, "yurucode"
        WScript.Quit 1
    End If
End If

' Launch the application
objShell.Run """" & strExePath & """", 1, False

' Clean up
Set objFSO = Nothing
Set objShell = Nothing

WScript.Quit 0