@echo off
rem Hidden server runner used by autostart.vbs (started by Windows at logon).
cd /d "%~dp0"
set ADMIN_KEY=mm123456
".venv\Scripts\python.exe" server.py >> "server.log" 2>&1
