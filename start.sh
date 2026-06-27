#!/bin/bash
cd ~/Projects/ley-lines-react
fuser -k 5173/tcp 2>/dev/null
sleep 1
setsid npx vite --host < /dev/null > /tmp/vite.log 2>&1 &
echo "Ley Lines dev server started — http://localhost:5173"
