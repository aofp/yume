' yurucode launcher script
' Starts yurucode development server silently

Dim objShell, strPath

' Create shell object
Set objShell = CreateObject("WScript.Shell")

' Get the script's directory (where yurucode is installed)
strPath = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' Change to yurucode directory
objShell.CurrentDirectory = strPath

' Run npm start:win command silently (0 = hidden window)
' Use 1 instead of 0 if you want to see the console window
objShell.Run "cmd /c npm run start:win", 0, False

' Optional: Show a brief notification that yurucode is starting
' Uncomment the next line if you want a popup notification
' MsgBox "yurucode is starting...", vbInformation, "yurucode", 1

' Clean up
Set objShell = Nothing

' Script ends immediately, processes continue in background
WScript.Quit