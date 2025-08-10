' Run yurucode without keeping console window open
' Only allows one instance to run at a time

Set objShell = CreateObject("WScript.Shell")
Set objWMI = GetObject("winmgmts:\\.\root\cimv2")

' Check if yurucode is already running (check for Electron process)
Set colProcesses = objWMI.ExecQuery("Select * from Win32_Process Where Name = 'electron.exe'")
If colProcesses.Count > 0 Then
    MsgBox "yurucode is already running!", vbInformation, "yurucode"
    WScript.Quit
End If

' Check if Node is already running our start-multi script
Set colNodeProcesses = objWMI.ExecQuery("Select * from Win32_Process Where Name = 'node.exe' AND CommandLine LIKE '%start-multi.js%'")
If colNodeProcesses.Count > 0 Then
    MsgBox "yurucode is already starting up!", vbInformation, "yurucode"
    WScript.Quit
End If

objShell.CurrentDirectory = "C:\Users\muuko\Desktop\yurucode"
objShell.Run "cmd /c node scripts/start-multi.js", 0, False
Set objShell = Nothing