' Launcher for the immersive site server, runs hidden (no console window).
' Started by the Windows Startup shortcut at logon. ASCII-safe: it locates
' this file's folder at runtime, so the path may contain non-ASCII chars.
Option Explicit
Dim fso, shell, base, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
base = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = """" & base & "\site-server.cmd"""
' 0 = hidden window, False = do not wait
shell.Run cmd, 0, False
