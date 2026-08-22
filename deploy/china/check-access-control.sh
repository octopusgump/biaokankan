#!/bin/sh
set -eu

trusted_networks_file="${BIAOKANKAN_TRUSTED_NETWORKS_FILE:-/etc/nginx/biaokankan/trusted-networks.conf}"
password_file="${BIAOKANKAN_PASSWORD_FILE:-/etc/nginx/biaokankan/.htpasswd}"
certificate_file="${BIAOKANKAN_CERTIFICATE_FILE:-/etc/letsencrypt/live/biaokankan.com/fullchain.pem}"
certificate_key_file="${BIAOKANKAN_CERTIFICATE_KEY_FILE:-/etc/letsencrypt/live/biaokankan.com/privkey.pem}"

require_nonempty_file() {
  if [ ! -f "$1" ] || [ ! -s "$1" ]; then
    echo "访问控制启动检查失败：文件缺失或为空：$1" >&2
    exit 1
  fi
}

require_nonempty_file "$trusted_networks_file"
require_nonempty_file "$password_file"
require_nonempty_file "$certificate_file"
require_nonempty_file "$certificate_key_file"

if ! grep -Eq '^[[:space:]]*allow[[:space:]]+[^;]+;' "$trusted_networks_file"; then
  echo "访问控制启动检查失败：白名单中没有有效的 allow 规则" >&2
  exit 1
fi

line_number=0
while IFS= read -r line || [ -n "$line" ]; do
  line_number=$((line_number + 1))
  if printf '%s\n' "$line" | grep -Eq '^[[:space:]]*(#.*)?$'; then
    continue
  fi
  if ! printf '%s\n' "$line" | grep -Eq '^[[:space:]]*allow[[:space:]]+[^;[:space:]]+[[:space:]]*;[[:space:]]*(#.*)?$'; then
    echo "访问控制启动检查失败：白名单第 ${line_number} 行不是单条有效的 allow 规则" >&2
    exit 1
  fi
  allow_value=$(printf '%s\n' "$line" | sed -n 's/^[[:space:]]*allow[[:space:]][[:space:]]*\([^;[:space:]][^;[:space:]]*\)[[:space:]]*;.*$/\1/p')

  if printf '%s\n' "$allow_value" | grep -Eq ':'; then
    echo "访问控制启动检查失败：白名单第 ${line_number} 行不能使用 IPv6，当前部署不监听 IPv6" >&2
    exit 1
  fi

  if [ "$allow_value" = "all" ]; then
    echo "访问控制启动检查失败：白名单第 ${line_number} 行不能允许所有地址" >&2
    exit 1
  fi

  if ! printf '%s\n' "$allow_value" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$'; then
    echo "访问控制启动检查失败：白名单第 ${line_number} 行不是有效的 IPv4 地址或 CIDR" >&2
    exit 1
  fi

  address=${allow_value%/*}
  if printf '%s\n' "$address" | grep -Eq '^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)'; then
    echo "访问控制启动检查失败：白名单第 ${line_number} 行不能使用 RFC1918 内网地址" >&2
    exit 1
  fi

  if printf '%s\n' "$address" | grep -Eq '^127\.'; then
    echo "访问控制启动检查失败：白名单第 ${line_number} 行不能使用回环地址" >&2
    exit 1
  fi

  if printf '%s\n' "$address" | grep -Eq '^169\.254\.'; then
    echo "访问控制启动检查失败：白名单第 ${line_number} 行不能使用链路本地地址" >&2
    exit 1
  fi

  prefix_length=32
  case "$allow_value" in
    */*) prefix_length=${allow_value##*/} ;;
  esac
  if [ "$prefix_length" -gt 32 ]; then
    echo "访问控制启动检查失败：白名单第 ${line_number} 行的 IPv4 前缀不得大于 /32" >&2
    exit 1
  fi
  if [ "$prefix_length" -lt 24 ]; then
    echo "访问控制启动检查失败：白名单第 ${line_number} 行的 IPv4 前缀不得小于 /24" >&2
    exit 1
  fi
done < "$trusted_networks_file"

if grep -Eq '203\.0\.113\.|2001:db8:' "$trusted_networks_file"; then
  echo "访问控制启动检查失败：白名单仍包含文档示例地址" >&2
  exit 1
fi

line_number=0
bcrypt_credential_count=0
while IFS= read -r line || [ -n "$line" ]; do
  line_number=$((line_number + 1))
  if printf '%s\n' "$line" | grep -Eq '^[[:space:]]*(#|$)'; then
    continue
  fi
  if ! printf '%s\n' "$line" | grep -Eq '^[A-Za-z0-9._-]+:\$2[aby]\$'; then
    echo "访问控制启动检查失败：密码文件第 ${line_number} 行不是 bcrypt 企业凭证" >&2
    exit 1
  fi
  bcrypt_credential_count=$((bcrypt_credential_count + 1))
done < "$password_file"

if [ "$bcrypt_credential_count" -eq 0 ]; then
  echo "访问控制启动检查失败：密码文件中没有 bcrypt 企业凭证" >&2
  exit 1
fi

echo "访问控制启动检查通过"
