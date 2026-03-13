Set WshShell = CreateObject("WScript.Shell")

Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
RunCommand = "cmd /c """"" & ScriptDir & "\run.bat"""""

' 1. Start the React server silently in the background
WshShell.Run RunCommand, 0, False

' 2. Wait 2.5 seconds to ensure Vite server has started
WScript.Sleep 2500

' 3. Open the default web browser pointing to the local dashboard
WshShell.Run "http://localhost:5173"
