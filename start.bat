@echo off
rem 脑干 3D 模型本地服务器：从 8091 起自动找空闲端口（8082 等端口已分配给其他工具，勿用）
set PORT=8091
:findport
netstat -an | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  set /a PORT+=1
  goto findport
)
echo Starting brainstem-3d at http://localhost:%PORT%
start "" http://localhost:%PORT%
where python >nul 2>&1
if %errorlevel%==0 (
  python -m http.server %PORT%
  goto :eof
)
where py >nul 2>&1
if %errorlevel%==0 (
  py -m http.server %PORT%
  goto :eof
)
npx --yes serve -l %PORT% .
