' yurucode Multi-Instance Launcher
' Starts multiple independent instances of yurucode

Option Explicit

Dim objShell, objFSO, strPath, intInstances, i
Dim strResponse

' Create objects
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get script directory
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Check if we're in the right directory
If Not objFSO.FileExists(strPath & "\package.json") Then
    MsgBox "Error: package.json not found!" & vbCrLf & _
           "Please place this script in the yurucode directory.", _
           vbCritical, "yurucode Multi-Instance"
    WScript.Quit 1
End If

' Ask how many instances
strResponse = InputBox("How many yurucode instances do you want to start?" & vbCrLf & _
                       "Each instance will run on its own port.", _
                       "yurucode Multi-Instance", "2")

If strResponse = "" Then
    WScript.Quit 0
End If

intInstances = CInt(strResponse)

If intInstances < 1 Or intInstances > 5 Then
    MsgBox "Please enter a number between 1 and 5", vbExclamation, "yurucode"
    WScript.Quit 1
End If

' Change to yurucode directory
objShell.CurrentDirectory = strPath

' Start each instance
For i = 1 To intInstances
    Dim intServerPort, intVitePort
    intServerPort = 3000 + i
    intVitePort = 5172 + i
    
    WScript.Echo "Starting instance " & i & " on ports " & intServerPort & " (server) and " & intVitePort & " (vite)..."
    
    ' Set environment variables for this instance
    objShell.Environment("Process").Item("CLAUDE_SERVER_PORT") = CStr(intServerPort)
    objShell.Environment("Process").Item("VITE_PORT") = CStr(intVitePort)
    
    ' Start the instance (visible console)
    objShell.Run "cmd /c title yurucode Instance " & i & " && npm run start:multi", 1, False
    
    ' Wait a bit between launches
    WScript.Sleep 2000
Next

MsgBox intInstances & " yurucode instances have been started!" & vbCrLf & vbCrLf & _
       "Each instance is running on its own ports." & vbCrLf & _
       "You can access them at:" & vbCrLf & _
       "Instance 1: http://localhost:5173" & vbCrLf & _
       "Instance 2: http://localhost:5174" & vbCrLf & _
       "(and so on...)", _
       vbInformation, "yurucode Multi-Instance"

' Clean up
Set objFSO = Nothing
Set objShell = Nothing

WScript.Quit 0