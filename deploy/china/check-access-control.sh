#!/bin/sh
set -eu

trusted_networks_file="${BIAOKANKAN_TRUSTED_NETWORKS_FILE:-/etc/nginx/biaokankan/trusted-networks.conf}"
password_file="${BIAOKANKAN_PASSWORD_FILE:-/etc/nginx/biaokankan/.htpasswd}"
certificate_file="${BIAOKANKAN_CERTIFICATE_FILE:-/etc/letsencrypt/live/biaokankan.com/fullchain.pem}"
certificate_key_file="${BIAOKANKAN_CERTIFICATE_KEY_FILE:-/etc/letsencrypt/live/biaokankan.com/privkey.pem}"

require_nonempty_readable_file() {
  if [ ! -f "$1" ] || [ ! -s "$1" ] || [ ! -r "$1" ]; then
    echo "访问控制启动检查失败：文件缺失、为空或不可读：$1" >&2
    exit 1
  fi
}

require_nonempty_readable_file "$trusted_networks_file"
require_nonempty_readable_file "$password_file"
require_nonempty_readable_file "$certificate_file"
require_nonempty_readable_file "$certificate_key_file"

if ! grep -Eq '^[[:space:]]*allow[[:space:]]+[^;]+;' "$trusted_networks_file"; then
  echo "访问控制启动检查失败：白名单中没有有效的 allow 规则" >&2
  exit 1
fi

if grep -Eq '203\.0\.113\.|2001:db8:' "$trusted_networks_file"; then
  echo "访问控制启动检查失败：白名单仍包含文档示例地址" >&2
  exit 1
fi

if ! grep -Eq '^[A-Za-z0-9._-]+:\$2[aby]\$' "$password_file"; then
  echo "访问控制启动检查失败：密码文件中没有 bcrypt 企业凭证" >&2
  exit 1
fi

echo "访问控制启动检查通过"
