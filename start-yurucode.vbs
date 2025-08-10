Set objShell = CreateObject("WScript.Shell")
objShell.Run "cmd /c cd /d " & Chr(34) & "C:\Users\muuko\Desktop\yurucode" & Chr(34) & " && npm run start:multi", 1, True
WScript.Quit