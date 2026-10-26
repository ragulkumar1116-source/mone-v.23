@echo off
title KRISHTECH Money Manager - OTP & Web Server
cd /d "%~dp0"
set "GMAIL_ADDRESS=ragulkumar1116@gmail.com"
set "GMAIL_APP_PASSWORD=swqqrkhdnjkbnecv"
set "FLASK_SECRET_KEY=myapi_live_ak_219b85e3_ec786bcbdcb62d2189f53dbaeec1f20dd1f915eec92a230341df9b7ca61dc5b7"

echo ========================================================
echo  Starting KRISHTECH Money Manager OTP ^& Web Server
echo  Sender: %GMAIL_ADDRESS%
echo  Port: 7000
echo  URL: http://127.0.0.1:7000
echo ========================================================
echo.
python app.py
pause
