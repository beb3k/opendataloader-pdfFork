@echo off
setlocal

set "REPO_ROOT=%~dp0.."
set "CODE_REVIEW_GRAPH_EXE=C:\Users\Satrio Faiz\AppData\Roaming\Python\Python313\Scripts\code-review-graph.exe"

cd /d "%REPO_ROOT%"

if not exist "%CODE_REVIEW_GRAPH_EXE%" (
  echo code-review-graph executable not found: "%CODE_REVIEW_GRAPH_EXE%" 1>&2
  exit /b 1
)

"%CODE_REVIEW_GRAPH_EXE%" %*
