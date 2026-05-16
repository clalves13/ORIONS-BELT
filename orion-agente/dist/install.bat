@echo off
echo Instalando Orion Agente...
sc create OrionAgente binPath= "%~dp0orion-agente-win.exe" start= auto
sc description OrionAgente "Orion Print - Monitoramento de Impressoras"
sc start OrionAgente
echo Servico instalado e iniciado!
pause