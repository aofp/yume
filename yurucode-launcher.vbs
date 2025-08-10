Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "C:\Users\muuko\Desktop\yurucode"

' Run with visible console window (1) and wait for it to complete (True)
objShell.Run "cmd /c node scripts/start-multi.js", 1, True

' Script ends here, window closes
WScript.Quit