BIN=/Users/artem_farafonov/Library/Caches/ms-playwright/chromium-1091/chrome-mac/Chromium.app/Contents/MacOS/Chromium
ARGS=(
"--headless --disable-gpu --no-sandbox --dump-dom data:text/html,<h1>TEST</h1>"
"--headless=new --disable-gpu --no-sandbox --dump-dom data:text/html,<h1>TEST</h1>"
"--headless --disable-gpu --no-sandbox --disable-dev-shm-usage --dump-dom data:text/html,<h1>TEST</h1>"
"--headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage --dump-dom data:text/html,<h1>TEST</h1>"
"--headless --disable-gpu --single-process --no-zygote --dump-dom data:text/html,<h1>TEST</h1>"
)
for a in "${ARGS[@]}"; do
  echo "=== $a" | cut -c1-55
  timeout 30 $BIN $a >/tmp/out.txt 2>/tmp/err.txt
  rc=$?
  echo "rc=$rc  out=$(head -c 30 /tmp/out.txt)"
done
