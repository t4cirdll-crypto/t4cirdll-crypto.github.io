@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

rem Keep CRLF line endings: cmd.exe misparses this UTF-8 batch file with LF only.
rem Always serve this directory, including paths with spaces or Cyrillic letters.
pushd "%~dp0"
if errorlevel 1 goto directory_error
if not exist "scripts\serve.py" goto missing_server

set "server_port=8000"
set "port_options=--fallback-port"
if not "%~1"=="" set "server_port=%~1"
if not "%~1"=="" set "port_options="

rem ThreadingHTTPServer requires Python 3.7 or newer; no third-party packages.
python -c "import sys; from http.server import ThreadingHTTPServer; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>&1
if not errorlevel 1 goto use_python
py -3 -c "import sys; from http.server import ThreadingHTTPServer; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>&1
if not errorlevel 1 goto use_launcher

echo Не найден работающий Python 3.7 или новее с модулем http.server.
echo Установите Python 3 и включите добавление Python в PATH
echo или установите Windows launcher py. Затем повторите запуск.
set "server_exit=1"
goto finish

:use_python
set "python_cmd=python"
goto run_server

:use_launcher
set "python_cmd=py -3"

:run_server
echo Запуск через %python_cmd%...
echo После появления Project preview откройте указанный там адрес.
echo Запрашиваемый порт: %server_port%.
if defined port_options echo Если он занят, сервер выберет свободный порт.
echo Для остановки нажмите Ctrl+C. Не закрывайте это окно во время игры.
%python_cmd% -u "scripts\serve.py" --port "%server_port%" %port_options%
set "server_exit=%errorlevel%"
echo.
if "%server_exit%"=="0" goto server_stopped
echo Сервер завершился с ошибкой. Проверьте сообщение выше.
echo Если порт %server_port% занят, откройте уже работающую игру
echo или запустите из терминала: serve.bat 8001
goto finish

:server_stopped
echo Сервер остановлен. Для повторного запуска откройте serve.bat снова.

:finish
popd
pause
exit /b %server_exit%

:missing_server
echo Не найден scripts\serve.py. Сохраните serve.bat в корне проекта игры.
set "server_exit=1"
goto finish

:directory_error
echo Не удалось открыть каталог игры. Проверьте расположение serve.bat и права доступа.
pause
exit /b 1
