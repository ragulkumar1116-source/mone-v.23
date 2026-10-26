@echo off
title KRISHTECH Money Manager - Resend OTP & Web Server
cd /d "%~dp0"
set "RESEND_API_KEY=re_RXFqdPKn_JNUiMbRaC4gwn4f4h8y8Zu2s"
set "RESEND_FROM=KRISHTECH Security <onboarding@resend.dev>"
set "PORT=7000"

echo ========================================================
echo  Starting KRISHTECH Resend Web ^& OTP Server
echo  Provider: Resend (https://resend.com)
echo  Port: 7000
echo  URL: http://127.0.0.1:7000
echo ========================================================
echo.
node server.js
pause
