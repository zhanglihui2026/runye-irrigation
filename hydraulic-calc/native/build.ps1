param([string]$EmSdk = $env:EMSDK)
$ErrorActionPreference = 'Stop'
if (-not $EmSdk) { throw 'Set EMSDK or pass -EmSdk pointing to Emscripten 4.0.23.' }
$compiler = Join-Path $EmSdk 'upstream/emscripten/em++.py'
$sdkPython = Get-ChildItem (Join-Path $EmSdk 'python') -Filter python.exe -Recurse | Select-Object -First 1
if (-not $sdkPython) { throw 'Emscripten bundled Python is missing; install and activate the SDK first.' }
$env:EM_CONFIG = Join-Path $EmSdk '.emscripten'
& $sdkPython.FullName $compiler (Join-Path $PSScriptRoot 'hydraulics.cpp') `
  '-std=c++17' '-O2' '--no-entry' '-sSINGLE_FILE=1' '-sWASM_ASYNC_COMPILATION=0' `
  '-sMODULARIZE=1' '-sEXPORT_NAME=createRunyeHydraulics' '-sENVIRONMENT=web,node' `
  '-sFILESYSTEM=0' '-sASSERTIONS=0' '-o' (Join-Path $PSScriptRoot '../hydraulics-wasm.js')
if ($LASTEXITCODE -ne 0) { throw 'C++ to WebAssembly build failed.' }
