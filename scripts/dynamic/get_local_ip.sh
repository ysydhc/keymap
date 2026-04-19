#!/usr/bin/env bash
# Title: 获取本机IP地址
# This script ignores the project path argument and prints the machine's primary IPv4 address.
# It tries several methods to be robust across macOS, Linux, and BSD.

# Try using the `ip` command (Linux)
ip_addr=$(ip -4 addr show scope global 2>/dev/null |
          grep -oE "inet [0-9]+(\.[0-9]+){3}" |
          awk '{print $2}' |
          head -n1)

# If `ip` didn't work, try `ifconfig` (macOS/BSD)
if [[ -z "$ip_addr" ]]; then
  ip_addr=$(ifconfig 2>/dev/null |
            awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')
fi

# Fallback to `hostname -I` (some Linux distros)
if [[ -z "$ip_addr" ]]; then
  ip_addr=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

# Final fallback: use `dig` to query an external resolver for the public IP (optional)
if [[ -z "$ip_addr" ]]; then
  ip_addr=$(dig +short myip.opendns.com @resolver1.opendns.com 2>/dev/null)
fi

# Output the IP address (or an empty string if not found)
echo "$ip_addr"