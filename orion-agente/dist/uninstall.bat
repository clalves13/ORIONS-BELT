@echo off
echo Removendo Orion Agente...
sc stop OrionAgente
sc delete OrionAgente
echo Servico removido!
pause