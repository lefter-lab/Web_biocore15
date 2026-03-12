@echo off
set DIR=%~dp0
set JAR=%DIR%gradle\wrapper\gradle-wrapper.jar
if exist "%JAR%" (
  "%JAVA_HOME%\bin\java" -jar "%JAR%" %*
) else (
  java -jar "%JAR%" %*
)
