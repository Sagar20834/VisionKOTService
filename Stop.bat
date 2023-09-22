@echo off
setlocal enabledelayedexpansion

REM Define the port number you want to check and kill processes for
set "PORT=3000"

REM Get all PIDs associated with the specified port and store them in an array
set "PIDS="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r "\<:%PORT%\>"') do (
    set "PID=%%a"
    set "PIDS=!PIDS! !PID!"
)

REM Check if there are any PIDs to kill
if "!PIDS!"=="" (
    echo No processes found using port %PORT%.
) else (
    echo Processes using port %PORT%: !PIDS!
    
    REM Kill all the processes in the array
    for %%b in (!PIDS!) do (
        echo Killing PID %%b
        taskkill /F /PID %%b
    )
)

endlocal
