#!/bin/bash
# [~*| SHADOW |*~] bot indito - Termuxban: bash inditas.sh
cd "$(dirname "$0")"
echo "== [~*| SHADOW |*~] bot inditasa =="

if ! command -v node >/dev/null 2>&1; then
  echo "Nincs Node.js, telepitem..."; pkg install -y nodejs-lts || exit 1
fi
if ! command -v pm2 >/dev/null 2>&1; then
  echo "Nincs pm2, telepitem..."; npm install -g pm2 || exit 1
fi
if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo "Letrehoztam a config.json-t. Toltsd ki (token, guildId, IP, RCON): nano config.json"
  echo "Utana futtasd ujra: bash inditas.sh"
  exit 1
fi
if grep -q "IDE_A_BOT_TOKENJE" config.json; then
  echo "A config.json-ban meg nincs kitoltve a token! nano config.json"; exit 1
fi
if [ ! -d node_modules/discord.js ]; then
  echo "Csomagok telepitese (npm install)..."; npm install || exit 1
fi

pm2 delete shadowbot >/dev/null 2>&1
pm2 start index.js --name shadowbot
pm2 save
sleep 8
echo
echo "== A bot naploja =="
pm2 logs shadowbot --lines 25 --nostream
