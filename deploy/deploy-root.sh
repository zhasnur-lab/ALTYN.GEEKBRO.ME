#!/usr/bin/env bash
# ============================================================
#  ALTYN (altyn.geekbro.me) — безопасный go-live, запускать через sudo.
#  Аддитивно и с самопроверкой: все существующие сайты должны остаться
#  как были, иначе — автоматический откат.
#  Использование: sudo bash /home/kussainkhanov/services/altyn/deploy/deploy-root.sh
# ============================================================
set -euo pipefail
DOMAIN="altyn.geekbro.me"
WEBROOT="/var/www/${DOMAIN}"
VHOST_SRC="/home/kussainkhanov/services/altyn/deploy/zz-${DOMAIN}.conf"
VHOST_DST="/etc/nginx/conf.d/zz-${DOMAIN}.conf"
EXISTING=(geekbro.me www.geekbro.me kawai.geekbro.me nexus.geekbro.me fun.geekbro.me haba.geekbro.me \
          onaident.kz www.onaident.kz \
          ali-t.kz app.ali-t.kz api.ali-t.kz media.ali-t.kz live.ali-t.kz storage.ali-t.kz)
say(){ printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok(){  printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
bad(){ printf '  \033[1;31m✗\033[0m %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { bad "Запустите через sudo/root."; exit 1; }

say "0/5  Node-сервис"
curl -sf -m5 http://127.0.0.1:4326/healthz >/dev/null || { bad "altyn.service не отвечает на :4326"; exit 1; }
ok "altyn.service отвечает"

say "1/5  Базовое состояние существующих сайтов"
declare -A BASE
for d in "${EXISTING[@]}"; do
  BASE[$d]=$(curl -s -k -m8 -o /dev/null -w "%{http_code}" --resolve "$d:443:127.0.0.1" "https://$d/" || echo 000)
  printf "  %-22s %s\n" "$d" "${BASE[$d]}"
done

say "2/5  Ставлю vhost и проверяю конфиг"
if [ -f "$VHOST_DST" ]; then cp "$VHOST_DST" "/tmp/${DOMAIN}.conf.bak"; HAD=1; else HAD=0; fi
cp "$VHOST_SRC" "$VHOST_DST"
if ! nginx -t; then
  bad "nginx -t не прошёл — откатываю."
  if [ "$HAD" = 1 ]; then cp "/tmp/${DOMAIN}.conf.bak" "$VHOST_DST"; else rm -f "$VHOST_DST"; fi
  exit 1
fi
ok "nginx -t прошёл"

say "3/5  reload nginx + проверка регрессии"
systemctl reload nginx; sleep 1
REG=0
for d in "${EXISTING[@]}"; do
  now=$(curl -s -k -m8 -o /dev/null -w "%{http_code}" --resolve "$d:443:127.0.0.1" "https://$d/" || echo 000)
  if [ "$now" = "${BASE[$d]}" ]; then ok "$d $now"; else bad "$d было ${BASE[$d]} стало $now"; REG=1; fi
done
if [ "$REG" -ne 0 ]; then
  bad "РЕГРЕССИЯ — откатываюсь."
  if [ "$HAD" = 1 ]; then cp "/tmp/${DOMAIN}.conf.bak" "$VHOST_DST"; else rm -f "$VHOST_DST"; fi
  nginx -t && systemctl reload nginx; exit 1
fi
ok "Существующие сайты в порядке"

say "4/5  TLS через certbot"
if grep -q "ssl_certificate" "$VHOST_DST"; then
  ok "сертификат уже прописан, пропускаю"
elif certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect --keep-until-expiring; then
  ok "Сертификат выпущен, HTTPS + redirect"
else
  bad "certbot не смог — HTTP-версия работает. Повторите: sudo certbot --nginx -d ${DOMAIN} --redirect"
fi

say "5/5  Финальная проверка"
for d in "${EXISTING[@]}"; do
  code=$(curl -s -k -m8 -o /dev/null -w "%{http_code}" --resolve "$d:443:127.0.0.1" "https://$d/" || echo 000)
  printf "  %-22s HTTPS %s\n" "$d" "$code"
done
nc=$(curl -s -k -m8 -o /dev/null -w "%{http_code}" --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" || echo 000)
printf "  %-22s HTTPS %s\n" "${DOMAIN}" "$nc"
ok "Готово: https://${DOMAIN}/"
