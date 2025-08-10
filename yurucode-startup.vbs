' yurucode Advanced Launcher
' Starts yurucode with better error handling and notifications

Option Explicit

Dim objShell, objFSO, strPath, strNpmPath, intResult
Dim strLogFile, objLogFile

' Create objects
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get script directory
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Check if we're in the right directory
If Not objFSO.FileExists(strPath & "\package.json") Then
    MsgBox "Error: package.json not found!" & vbCrLf & _
           "Please place this script in the yurucode directory.", _
           vbCritical, "yurucode"
    WScript.Quit 1
End If

' Change to yurucode directory
objShell.CurrentDirectory = strPath

' Create log file for debugging
strLogFile = strPath & "\yurucode-startup.log"
Set objLogFile = objFSO.CreateTextFile(strLogFile, True)
objLogFile.WriteLine "yurucode startup - " & Now()
objLogFile.WriteLine "Working directory: " & strPath

' Check if npm is available
On Error Resume Next
intResult = objShell.Run("cmd /c npm --version", 0, True)
If Err.Number <> 0 Then
    objLogFile.WriteLine "Error: npm not found"
    MsgBox "Error: npm is not installed or not in PATH!" & vbCrLf & _
           "Please install Node.js first.", vbCritical, "yurucode"
    objLogFile.Close
    WScript.Quit 1
End If
On Error GoTo 0

' Kill any existing processes on ports
objLogFile.WriteLine "Killing processes on ports 3001 and 5173..."
objShell.Run "cmd /c npm run prestart", 1, True

' Start yurucode with visible console window
objLogFile.WriteLine "Starting yurucode..."
' Use 1 to show console window, False to not wait for it to finish
objShell.Run "cmd /c npm run start:win", 1, False

' Wait a moment for servers to start
WScript.Sleep 3000

' Open browser to the app (optional - comment out if not wanted)
' objShell.Run "http://localhost:5173", 1, False

' Show success notification
objLogFile.WriteLine "yurucode started successfully"
objLogFile.Close

' Create a temporary notification file that the app can detect
Dim objTempFile
Set objTempFile = objFSO.CreateTextFile(strPath & "\.yurucode-started", True)
objTempFile.WriteLine Now()
objTempFile.Close

' Clean up
Set objLogFile = Nothing
Set objFSO = Nothing
Set objShell = Nothing

WScript.Quit 0