#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_NAME="$(basename "$0")"
SCRIPT_VERSION="${SCRIPT_VERSION:-1.4.0}"
SERVER_VERSION="${SERVER_VERSION:-1.4.0}"
APP_NAME="bianbu-mcp-server"
INSTALL_ROOT="/opt/${APP_NAME}"
APP_FILE="${INSTALL_ROOT}/server.mjs"
PACKAGE_FILE="${INSTALL_ROOT}/package.json"
SERVICE_NAME="${APP_NAME}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_FILE="/etc/default/${SERVICE_NAME}"
BACKUP_ROOT="/opt/${APP_NAME}-backups"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-11434}"
MCP_PATH="${MCP_PATH:-/mcp}"
RUN_USER="${RUN_USER:-bianbu}"
RUN_GROUP="${RUN_GROUP:-${RUN_USER}}"
FILE_ROOT="${FILE_ROOT:-/home/${RUN_USER}}"
ENABLE_PASSWORDLESS_SUDO="${ENABLE_PASSWORDLESS_SUDO:-false}"
MAX_FILE_MB="${MAX_FILE_MB:-64}"
MAX_COMMAND_OUTPUT_KB="${MAX_COMMAND_OUTPUT_KB:-256}"
MAX_REQUEST_BODY_MB="${MAX_REQUEST_BODY_MB:-8}"
MAX_CONCURRENT_REQUESTS="${MAX_CONCURRENT_REQUESTS:-32}"
MAX_UPLOAD_SESSIONS="${MAX_UPLOAD_SESSIONS:-16}"
MAX_DOWNLOAD_SESSIONS="${MAX_DOWNLOAD_SESSIONS:-16}"
MAX_SHELL_SESSIONS="${MAX_SHELL_SESSIONS:-8}"
MAX_PTY_SESSIONS="${MAX_PTY_SESSIONS:-4}"
TLS_CERT_FILE="${TLS_CERT_FILE:-}"
TLS_KEY_FILE="${TLS_KEY_FILE:-}"
MCP_TRANSPORT_MODE="${MCP_TRANSPORT_MODE:-stateless}"
DEFAULT_SESSION_NAME="manual-$(date -u +%Y%m%dT%H%M%SZ)"
SESSION_NAME="${SESSION_NAME:-$DEFAULT_SESSION_NAME}"

LAST_BACKUP_DIR=""
ROLLBACK_ON_EXIT=0
ROLLBACK_BACKUP_DIR=""
ROLLBACK_STAGING_ROOT=""
ROLLBACK_PREVIOUS_ROOT=""

log() {
  printf '[%s] [%s] [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SCRIPT_NAME" "$SESSION_NAME" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<EOF
用法:
  $SCRIPT_NAME install
  $SCRIPT_NAME up
  $SCRIPT_NAME bootstrap
  $SCRIPT_NAME start
  $SCRIPT_NAME stop
  $SCRIPT_NAME restart
  $SCRIPT_NAME status
  $SCRIPT_NAME recover
  $SCRIPT_NAME repair
  $SCRIPT_NAME restore-latest
  $SCRIPT_NAME version
  $SCRIPT_NAME logs [journalctl参数...]
  $SCRIPT_NAME show-config
  $SCRIPT_NAME help

默认行为:
  - 在当前 Bianbu Cloud 云主机上启动一个 MCP server
  - MCP endpoint: http://<你的主机>:${PORT}${MCP_PATH}
  - 健康检查:   http://<你的主机>:${PORT}/health
  - 默认使用 stateless Streamable HTTP，适合经由 Bianbu 平台 HTTPS 网关暴露
  - 当前脚本版本: ${SCRIPT_VERSION}，内置服务版本: ${SERVER_VERSION}

MCP transport mode:
  - stateless  推荐。每个请求独立处理，不依赖 MCP-Session-Id，兼容平台网关
  - stateful   传统会话模式，支持 MCP-Session-Id / GET / DELETE

MCP tools:
  - health
  - run_command
  - list_directory
  - read_text_file
  - write_text_file
  - upload_binary_file
  - download_binary_file
  - make_directory
  - delete_path
  - rename_path
  - open_shell_session / exec_shell_session / close_shell_session
  - open_pty_session / write_pty_input / read_pty_output / resize_pty / close_pty_session
  - upload_chunked_begin / upload_chunked_part / upload_chunked_finish / upload_chunked_abort
  - download_chunked_begin / download_chunked_part / download_chunked_close

常用环境变量:
  HOST                   服务监听地址，默认: ${HOST}
  PORT                   服务端口，默认: ${PORT}
  MCP_PATH               MCP 挂载路径，默认: ${MCP_PATH}
  MCP_TRANSPORT_MODE     stateless 或 stateful，默认: ${MCP_TRANSPORT_MODE}
  RUN_USER               systemd 运行用户，默认: ${RUN_USER}
  RUN_GROUP              systemd 运行组，默认: ${RUN_GROUP}
  FILE_ROOT              文件操作根目录，默认: ${FILE_ROOT}
  ENABLE_PASSWORDLESS_SUDO  bootstrap 时为 RUN_USER 自动配置 sudo 免密码，默认: ${ENABLE_PASSWORDLESS_SUDO}
  MAX_FILE_MB            上传/下载单文件大小限制，默认: ${MAX_FILE_MB} MB
  MAX_COMMAND_OUTPUT_KB  命令输出截断上限，默认: ${MAX_COMMAND_OUTPUT_KB} KB
  MAX_REQUEST_BODY_MB    HTTP JSON 请求体上限，默认: ${MAX_REQUEST_BODY_MB} MB
  MAX_CONCURRENT_REQUESTS 最大并发 MCP 请求数，超出返回 429，默认: ${MAX_CONCURRENT_REQUESTS}
  MAX_UPLOAD_SESSIONS    最大并发上传会话数，默认: ${MAX_UPLOAD_SESSIONS}
  MAX_DOWNLOAD_SESSIONS  最大并发下载会话数，默认: ${MAX_DOWNLOAD_SESSIONS}
  MAX_SHELL_SESSIONS     最大并发 Shell 会话数，默认: ${MAX_SHELL_SESSIONS}
  MAX_PTY_SESSIONS       最大并发 PTY 会话数，默认: ${MAX_PTY_SESSIONS}
  TLS_CERT_FILE          可选，HTTPS 证书路径
  TLS_KEY_FILE           可选，HTTPS 私钥路径

示例:
  chmod +x ./$SCRIPT_NAME
  MCP_TRANSPORT_MODE=stateless ./$SCRIPT_NAME bootstrap
  curl http://127.0.0.1:${PORT}/health

权限说明:
  - 非 root 执行 bootstrap 时，脚本会自动调用 sudo，并在需要时提示输入当前用户密码
  - ENABLE_PASSWORDLESS_SUDO 默认关闭；仅在你明确接受风险时再设置为 true
  - 若 ENABLE_PASSWORDLESS_SUDO=true 会为 RUN_USER 写入 sudoers，便于后续 MCP 工具以 as_root=true 免密码提权

公网暴露建议:
  - Bianbu 虚拟平台建议优先使用 MCP_TRANSPORT_MODE=stateless
  - 认证默认依赖外层平台/网关已有的 X-API-KEY；脚本本身不再额外生成第二层 token
  - 强烈建议设置 TLS_CERT_FILE / TLS_KEY_FILE，或放在 HTTPS 反向代理/网关后面
  - 默认以非 root 用户运行；如需更高权限，请显式设置 RUN_USER / FILE_ROOT 并知晓风险
  - bootstrap 会自动检测并清理旧版残留安装
EOF
}

need_root_prefix() {
  if [ "$(id -u)" -eq 0 ]; then
    printf ''
  elif command -v sudo >/dev/null 2>&1; then
    printf 'sudo'
  else
    die "需要 root 权限，请使用 root 运行或先安装 sudo"
  fi
}

run_as_root() {
  local prefix
  prefix="$(need_root_prefix)"
  if [ -n "$prefix" ]; then
    "$prefix" "$@"
  else
    "$@"
  fi
}

require_systemd() {
  command -v systemctl >/dev/null 2>&1 || die "未找到 systemctl，当前环境不支持 systemd"
}

write_root_file() {
  local dest="$1"
  local mode="$2"
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  run_as_root install -m "$mode" "$tmp" "$dest"
  rm -f "$tmp"
}

service_file_exists() {
  run_as_root test -f "$SERVICE_FILE"
}

stop_existing_service_if_needed() {
  require_systemd
  if service_file_exists && run_as_root systemctl is-active --quiet "$SERVICE_NAME"; then
    log "检测到已运行服务，先停止: $SERVICE_NAME"
    run_as_root systemctl stop "$SERVICE_NAME"
  fi
}

cleanup_legacy_install() {
  local legacy_paths
  local stale_paths
  local item
  local found_any=0

  legacy_paths=(
    "$INSTALL_ROOT/.venv"
    "$INSTALL_ROOT/app.py"
    "$INSTALL_ROOT/requirements.txt"
    "$INSTALL_ROOT/server.py"
  )

  stale_paths=(
    "$INSTALL_ROOT/node_modules"
    "$INSTALL_ROOT/package-lock.json"
    "$INSTALL_ROOT/server.mjs"
    "$INSTALL_ROOT/package.json"
  )

  stop_existing_service_if_needed

  for item in "${legacy_paths[@]}"; do
    if run_as_root test -e "$item"; then
      if [ "$found_any" -eq 0 ]; then
        log "检测到旧版/异构安装残留，开始自动清理"
        found_any=1
      fi
      log "清理旧遗留: $item"
      run_as_root rm -rf "$item"
    fi
  done

  for item in "${stale_paths[@]}"; do
    if run_as_root test -e "$item"; then
      if [ "$found_any" -eq 0 ]; then
        log "检测到上次安装残留，开始自动清理"
        found_any=1
      fi
      log "清理安装缓存: $item"
      run_as_root rm -rf "$item"
    fi
  done

  if [ "$found_any" -eq 0 ]; then
    log "未发现需要清理的旧安装残留"
  fi
}

backup_existing_installation() {
  local timestamp
  local backup_dir
  local has_content=0

  LAST_BACKUP_DIR=""
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_dir="${BACKUP_ROOT}/${timestamp}"
  run_as_root install -d -m 700 "$BACKUP_ROOT" "$backup_dir"

  if run_as_root test -d "$INSTALL_ROOT"; then
    has_content=1
    log "备份当前安装目录: $INSTALL_ROOT"
    run_as_root cp -a "$INSTALL_ROOT" "$backup_dir/install_root"
  fi

  if service_file_exists; then
    has_content=1
    log "备份 systemd service: $SERVICE_FILE"
    run_as_root cp -a "$SERVICE_FILE" "$backup_dir/${SERVICE_NAME}.service"
  fi

  if run_as_root test -f "$ENV_FILE"; then
    has_content=1
    log "备份环境文件: $ENV_FILE"
    run_as_root cp -a "$ENV_FILE" "$backup_dir/${SERVICE_NAME}.env"
  fi

  if [ "$has_content" -eq 0 ]; then
    run_as_root rmdir "$backup_dir" >/dev/null 2>&1 || true
    log "未发现可备份的现有安装"
    return 0
  fi

  log "已创建备份: $backup_dir"
  LAST_BACKUP_DIR="$backup_dir"
}

ensure_runtime_user() {
  if ! run_as_root id -u "$RUN_USER" >/dev/null 2>&1; then
    die "运行用户不存在: $RUN_USER"
  fi

  if ! run_as_root getent group "$RUN_GROUP" >/dev/null 2>&1; then
    die "运行组不存在: $RUN_GROUP"
  fi

  case "$MCP_TRANSPORT_MODE" in
    stateless|stateful) ;;
    *) die "MCP_TRANSPORT_MODE 仅支持 stateless 或 stateful，当前: $MCP_TRANSPORT_MODE" ;;
  esac

  case "$ENABLE_PASSWORDLESS_SUDO" in
    true|false) ;;
    *) die "ENABLE_PASSWORDLESS_SUDO 仅支持 true 或 false，当前: $ENABLE_PASSWORDLESS_SUDO" ;;
  esac

  if { [ -n "$TLS_CERT_FILE" ] && [ -z "$TLS_KEY_FILE" ]; } || { [ -z "$TLS_CERT_FILE" ] && [ -n "$TLS_KEY_FILE" ]; }; then
    die "TLS_CERT_FILE 与 TLS_KEY_FILE 必须同时设置"
  fi

  if [ -n "$TLS_CERT_FILE" ]; then
    run_as_root test -r "$TLS_CERT_FILE" || die "TLS 证书不可读: $TLS_CERT_FILE"
    run_as_root test -r "$TLS_KEY_FILE" || die "TLS 私钥不可读: $TLS_KEY_FILE"
  fi

  run_as_root install -d -m 755 "$INSTALL_ROOT"
  if [ "$FILE_ROOT" != "/" ]; then
    run_as_root install -d -m 755 -o "$RUN_USER" -g "$RUN_GROUP" "$FILE_ROOT"
  fi
}

configure_passwordless_sudo() {
  if [ "$ENABLE_PASSWORDLESS_SUDO" != "true" ]; then
    log "跳过 sudo 免密码配置"
    return 0
  fi

  if [ "$RUN_USER" = "root" ]; then
    log "RUN_USER=root，无需配置 sudo 免密码"
    return 0
  fi

  command -v visudo >/dev/null 2>&1 || die "未找到 visudo，请先安装 sudo"

  local sudoers_file="/etc/sudoers.d/${SERVICE_NAME}"
  write_root_file "$sudoers_file" 440 <<EOF
Defaults:${RUN_USER} !requiretty
${RUN_USER} ALL=(root) NOPASSWD:ALL
EOF
  run_as_root visudo -cf "$sudoers_file" >/dev/null
  log "已为 ${RUN_USER} 配置 sudo 免密码: $sudoers_file"
}

wait_for_local_health() {
  local attempts="${1:-20}"
  local delay="${2:-2}"
  local i
  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      log "本地健康检查通过"
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

finalize_service_start() {
  require_systemd
  run_as_root systemctl daemon-reload
  run_as_root systemctl reset-failed "$SERVICE_NAME" || true
  run_as_root systemctl enable --now "$SERVICE_NAME"
  run_as_root systemctl restart "$SERVICE_NAME"
  if ! wait_for_local_health 25 2; then
    run_as_root systemctl --no-pager --full status "$SERVICE_NAME" || true
    run_as_root journalctl -u "$SERVICE_NAME" -n 120 --no-pager || true
    die "服务启动后健康检查失败"
  fi
  run_as_root systemctl --no-pager --full status "$SERVICE_NAME" || true
}

ensure_node_version() {
  command -v node >/dev/null 2>&1 || die "未找到 node，请先执行: $SCRIPT_NAME install"
  if ! node -e "const major=Number(process.versions.node.split('.')[0]); process.exit(major >= 18 ? 0 : 1)"; then
    die "Node.js 版本过低，要求 >= 18"
  fi
}

write_package() {
  local package_file="${1:-$PACKAGE_FILE}"
  write_root_file "$package_file" 644 <<EOF
{
  "name": "bianbu-mcp-server",
  "version": "${SERVER_VERSION}",
  "private": true,
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.27.1",
    "express": "^5.2.1",
    "zod": "^4.0.0"
  }
}
EOF
}

write_app() {
  local app_file="${1:-$APP_FILE}"
  write_root_file "$app_file" 755 <<'EOF'
import { randomBytes, randomUUID } from 'node:crypto';
import { exec as execCb, spawn as spawnCb } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';

const exec = promisify(execCb);
const SERVER_VERSION = '__SERVER_VERSION__';
const INSTALLER_SCRIPT_VERSION = '__SCRIPT_VERSION__';
const SUPPORTED_TOOLS = [
  'health',
  'list_directory',
  'read_text_file',
  'write_text_file',
  'upload_binary_file',
  'download_binary_file',
  'make_directory',
  'delete_path',
  'rename_path',
  'run_command',
  'open_shell_session',
  'exec_shell_session',
  'close_shell_session',
  'open_pty_session',
  'write_pty_input',
  'read_pty_output',
  'resize_pty',
  'close_pty_session',
  'upload_chunked_begin',
  'upload_chunked_part',
  'upload_chunked_finish',
  'upload_chunked_abort',
  'download_chunked_begin',
  'download_chunked_part',
  'download_chunked_close',
];

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || '11434');
const MCP_PATH = process.env.MCP_PATH || '/mcp';
const FILE_ROOT = path.resolve(process.env.FILE_ROOT || '/');
const ENABLE_PASSWORDLESS_SUDO=(process.env.ENABLE_PASSWORDLESS_SUDO || 'true').toLowerCase() === 'true';
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_MB || '64') * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = Number(process.env.MAX_COMMAND_OUTPUT_KB || '256') * 1024;
const MAX_REQUEST_BODY_MB = Number(process.env.MAX_REQUEST_BODY_MB || '8');
const MAX_REQUEST_BODY_BYTES = MAX_REQUEST_BODY_MB * 1024 * 1024;
const EXPRESS_JSON_LIMIT = `${MAX_REQUEST_BODY_MB}mb`;
const TLS_CERT_FILE = process.env.TLS_CERT_FILE || '';
const TLS_KEY_FILE = process.env.TLS_KEY_FILE || '';
const MCP_TRANSPORT_MODE = (process.env.MCP_TRANSPORT_MODE || 'stateless').toLowerCase();
const MAX_CONCURRENT_REQUESTS = Number(process.env.MAX_CONCURRENT_REQUESTS || '32');
const MAX_UPLOAD_SESSIONS = Number(process.env.MAX_UPLOAD_SESSIONS || '16');
const MAX_DOWNLOAD_SESSIONS = Number(process.env.MAX_DOWNLOAD_SESSIONS || '16');
const MAX_SHELL_SESSIONS = Number(process.env.MAX_SHELL_SESSIONS || '8');
const MAX_PTY_SESSIONS = Number(process.env.MAX_PTY_SESSIONS || '4');
const PTY_OUTPUT_BUFFER_MAX = 512 * 1024;
const CANONICAL_FILE_ROOT = FILE_ROOT === '/' ? '/' : fs.realpathSync(FILE_ROOT);
const HAS_SUDO = fs.existsSync('/usr/bin/sudo') || fs.existsSync('/bin/sudo');
const shellSessions = new Map();
const uploadSessions = new Map();
const downloadSessions = new Map();
const ptySessions = new Map();
const SESSION_IDLE_MS = 60 * 60 * 1000;
const SERVER_START_TIME = Date.now();
let activeRequests = 0;
let totalRequests = 0;
let throttledRequests = 0;

if (!['stateless', 'stateful'].includes(MCP_TRANSPORT_MODE)) {
  throw new Error(`Unsupported MCP_TRANSPORT_MODE: ${MCP_TRANSPORT_MODE}`);
}
if (!(MAX_REQUEST_BODY_MB > 0)) {
  throw new Error(`MAX_REQUEST_BODY_MB must be > 0, got ${MAX_REQUEST_BODY_MB}`);
}

function textResult(text, structuredContent = undefined) {
  const result = { content: [{ type: 'text', text }] };
  if (structuredContent !== undefined) {
    result.structuredContent = structuredContent;
  }
  return result;
}

function truncateText(value, limit) {
  const text = value || '';
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= limit) {
    return text;
  }
  return buffer.subarray(0, limit).toString('utf8') + '\n...[truncated]';
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function rootHelperScript() {
  return String.raw`import base64, json, os, shutil, stat, sys, tempfile
from datetime import datetime, timezone
payload = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
op = payload['op']
target = payload.get('path', '')

def stat_dict(p):
    st = os.stat(p)
    return {
        'path': p,
        'size': st.st_size,
        'modified': datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        'is_dir': stat.S_ISDIR(st.st_mode),
        'is_file': stat.S_ISREG(st.st_mode),
    }

def ensure_parent(p):
    parent = os.path.dirname(p) or '.'
    os.makedirs(parent, exist_ok=True)

def part_offset_from_name(name):
    stem = name.rsplit('.', 1)[0]
    return int(stem)

if op == 'list_directory':
    if not os.path.isdir(target):
        raise RuntimeError(f'not a directory: {target}')
    items = [stat_dict(os.path.join(target, name)) for name in sorted(os.listdir(target))]
    print(json.dumps({'items': items}, ensure_ascii=False))
elif op == 'read_text_file':
    if not os.path.isfile(target):
        raise RuntimeError(f'file not found: {target}')
    max_bytes = int(payload['max_bytes'])
    if os.path.getsize(target) > max_bytes:
        raise RuntimeError(f'file exceeds max_bytes={max_bytes}: {target}')
    with open(target, 'r', encoding=payload.get('encoding', 'utf-8')) as fh:
        print(json.dumps({'path': target, 'content': fh.read()}, ensure_ascii=False))
elif op == 'write_text_file':
    ensure_parent(target)
    if (not payload.get('overwrite', True)) and os.path.exists(target):
        raise RuntimeError(f'target exists and overwrite=false: {target}')
    fd, tmp_path = tempfile.mkstemp(prefix='.mcp-write-', dir=os.path.dirname(target) or '.')
    os.close(fd)
    try:
        with open(tmp_path, 'w', encoding=payload.get('encoding', 'utf-8')) as fh:
            fh.write(payload['content'])
        os.replace(tmp_path, target)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
    print(json.dumps(stat_dict(target), ensure_ascii=False))
elif op == 'upload_binary_file':
    data = base64.b64decode(payload['content_base64'])
    if len(data) > int(payload['max_file_bytes']):
        raise RuntimeError(f"payload exceeds max size {payload['max_file_bytes']} bytes")
    ensure_parent(target)
    if (not payload.get('overwrite', True)) and os.path.exists(target):
        raise RuntimeError(f'target exists and overwrite=false: {target}')
    fd, tmp_path = tempfile.mkstemp(prefix='.mcp-bin-', dir=os.path.dirname(target) or '.')
    os.close(fd)
    try:
        with open(tmp_path, 'wb') as fh:
            fh.write(data)
        os.replace(tmp_path, target)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
    print(json.dumps(stat_dict(target), ensure_ascii=False))
elif op == 'write_binary_part':
    data = base64.b64decode(payload['content_base64'])
    if len(data) > int(payload['max_file_bytes']):
        raise RuntimeError(f"payload exceeds max size {payload['max_file_bytes']} bytes")
    ensure_parent(target)
    with open(target, 'wb') as fh:
        fh.write(data)
    out = stat_dict(target)
    out['written'] = len(data)
    print(json.dumps(out, ensure_ascii=False))
elif op == 'download_binary_file':
    if not os.path.isfile(target):
        raise RuntimeError(f'file not found: {target}')
    max_bytes = int(payload['max_bytes'])
    if os.path.getsize(target) > max_bytes:
        raise RuntimeError(f'file exceeds max_bytes={max_bytes}: {target}')
    with open(target, 'rb') as fh:
        content = fh.read()
    out = stat_dict(target)
    out['content_base64'] = base64.b64encode(content).decode('ascii')
    print(json.dumps(out, ensure_ascii=False))
elif op == 'make_directory':
    parents = bool(payload.get('parents', True))
    if parents:
        os.makedirs(target, exist_ok=True)
    else:
        os.mkdir(target)
    print(json.dumps(stat_dict(target), ensure_ascii=False))
elif op == 'delete_path':
    if not os.path.exists(target):
        raise RuntimeError(f'path not found: {target}')
    info = stat_dict(target)
    recursive = bool(payload.get('recursive', False))
    if info['is_dir']:
        if not recursive:
            raise RuntimeError(f'path is directory, set recursive=true: {target}')
        shutil.rmtree(target)
    else:
        os.remove(target)
    info['ok'] = True
    print(json.dumps(info, ensure_ascii=False))
elif op == 'rename_path':
    dest = payload['dest']
    ensure_parent(dest)
    os.replace(target, dest)
    print(json.dumps(stat_dict(dest), ensure_ascii=False))
elif op == 'path_info':
    if not os.path.exists(target):
        raise RuntimeError(f'path not found: {target}')
    print(json.dumps(stat_dict(target), ensure_ascii=False))
elif op == 'merge_binary_parts':
    if not os.path.isdir(target):
        raise RuntimeError(f'parts directory not found: {target}')
    dest = payload['dest']
    expected_size = payload.get('expected_size')
    ensure_parent(dest)
    part_entries = []
    for name in os.listdir(target):
        full = os.path.join(target, name)
        if not os.path.isfile(full):
            continue
        part_entries.append((part_offset_from_name(name), os.path.getsize(full), full))
    part_entries.sort(key=lambda entry: entry[0])
    cursor = 0
    for offset, size, _full in part_entries:
        if offset != cursor:
            raise RuntimeError(f'missing or overlapping part at offset={offset}, expected={cursor}')
        cursor += size
    if expected_size is not None and cursor != int(expected_size):
        raise RuntimeError(f'merged size {cursor} does not match expected_size={expected_size}')
    fd, tmp_path = tempfile.mkstemp(prefix='.mcp-merge-', dir=os.path.dirname(dest) or '.')
    os.close(fd)
    try:
        with open(tmp_path, 'wb') as out:
            for _offset, _size, full in part_entries:
                with open(full, 'rb') as src:
                    shutil.copyfileobj(src, out, 1024 * 1024)
        os.replace(tmp_path, dest)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
    out = stat_dict(dest)
    out['merged_parts'] = len(part_entries)
    out['merged_bytes'] = cursor
    print(json.dumps(out, ensure_ascii=False))
elif op == 'read_binary_chunk':
    if not os.path.isfile(target):
        raise RuntimeError(f'file not found: {target}')
    offset = int(payload.get('offset', 0))
    chunk_bytes = int(payload.get('chunk_bytes', 262144))
    with open(target, 'rb') as fh:
        fh.seek(offset)
        data = fh.read(chunk_bytes)
    out = stat_dict(target)
    out['offset'] = offset
    out['bytes_read'] = len(data)
    out['done'] = offset + len(data) >= out['size']
    out['content_base64'] = base64.b64encode(data).decode('ascii')
    print(json.dumps(out, ensure_ascii=False))
else:
    raise RuntimeError(f'unsupported op: {op}')`;
}

async function execShell(command, { cwd='/', timeoutSeconds=120, asRoot=false } = {}) {
  const wrapped = `cd ${shellQuote(cwd)} && ${command}`;
  const finalCommand = asRoot
    ? `sudo -n -- /bin/bash -lc ${shellQuote(wrapped)}`
    : wrapped;

  if (asRoot && process.getuid() !== 0 && !HAS_SUDO) {
    throw new Error('as_root requested but sudo is unavailable');
  }

  return exec(finalCommand, {
    cwd: '/',
    shell: '/bin/bash',
    timeout: timeoutSeconds * 1000,
    maxBuffer: Math.max(MAX_COMMAND_OUTPUT_BYTES * 4, 1024 * 1024),
  });
}

async function runRootFileOp(payload, timeoutSeconds = 120) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const command = `python3 -c ${shellQuote(rootHelperScript())} ${shellQuote(encoded)}`;
  const completed = await execShell(command, { cwd: '/', timeoutSeconds, asRoot: true });
  return JSON.parse(completed.stdout || '{}');
}

async function resolvePath(rawPath) {
  const candidate = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(FILE_ROOT, rawPath);

  if (CANONICAL_FILE_ROOT === '/') {
    return candidate;
  }

  let probe = candidate;
  while (true) {
    try {
      await fs.promises.lstat(probe);
      break;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) {
        throw new Error(`path not resolvable: ${rawPath}`);
      }
      probe = parent;
    }
  }

  const canonicalProbe = await fs.promises.realpath(probe);
  const suffix = path.relative(probe, candidate);
  const canonicalCandidate = path.resolve(canonicalProbe, suffix);

  if (canonicalCandidate !== CANONICAL_FILE_ROOT && !canonicalCandidate.startsWith(CANONICAL_FILE_ROOT + path.sep)) {
    throw new Error(`path escapes FILE_ROOT: ${rawPath}`);
  }

  return canonicalCandidate;
}

async function resolveRequestedPath(rawPath, asRoot = false) {
  if (asRoot && path.isAbsolute(rawPath)) {
    return path.resolve(rawPath);
  }
  return resolvePath(rawPath);
}

async function fileStat(target) {
  const stat = await fs.promises.stat(target);
  return {
    path: target,
    size: stat.size,
    modified: new Date(stat.mtimeMs).toISOString(),
    is_dir: stat.isDirectory(),
    is_file: stat.isFile(),
  };
}

function newSessionId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

async function cleanupUploadSession(session) {
  if (!session?.temp_dir) {
    return;
  }
  await deleteAnyPath(session.temp_dir, true, session.as_root).catch(() => {});
}

function ptyHelperScript() {
  return String.raw`#!/usr/bin/env python3
import pty, os, sys, select, signal, struct, fcntl, termios, json, base64

def set_winsize(fd, rows, cols):
    winsize = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

def send_msg(msg):
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + '\n')
    sys.stdout.flush()

config = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
initial_cols = config.get('cols', 80)
initial_rows = config.get('rows', 24)
shell = config.get('shell', '/bin/bash')
cwd = config.get('cwd', '/')
env_override = config.get('env', {})

master_fd, slave_fd = pty.openpty()
set_winsize(slave_fd, initial_rows, initial_cols)

pid = os.fork()
if pid == 0:
    os.close(master_fd)
    os.setsid()
    fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
    os.dup2(slave_fd, 0)
    os.dup2(slave_fd, 1)
    os.dup2(slave_fd, 2)
    if slave_fd > 2:
        os.close(slave_fd)
    try:
        os.chdir(cwd)
    except OSError:
        pass
    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    env['COLUMNS'] = str(initial_cols)
    env['LINES'] = str(initial_rows)
    env.update(env_override)
    os.execvpe(shell, [shell, '-l'], env)
else:
    os.close(slave_fd)
    flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    stdin_fd = sys.stdin.fileno()
    old_stdin_flags = fcntl.fcntl(stdin_fd, fcntl.F_GETFL)
    fcntl.fcntl(stdin_fd, fcntl.F_SETFL, old_stdin_flags | os.O_NONBLOCK)
    # Ignore SIGCHLD to prevent select() interruption from .bashrc subprocesses etc.
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    child_exited = False
    stdin_buf = b''
    while True:
        fds_to_watch = [master_fd]
        if not child_exited:
            fds_to_watch.append(stdin_fd)
        try:
            readable, _, _ = select.select(fds_to_watch, [], [], 0.5)
        except (select.error, InterruptedError, ValueError):
            pass
        else:
            if master_fd in readable:
                try:
                    data = os.read(master_fd, 65536)
                    if data:
                        send_msg({'type': 'output', 'data': base64.b64encode(data).decode('ascii')})
                    else:
                        break
                except OSError:
                    break
            if stdin_fd in readable:
                try:
                    chunk = os.read(stdin_fd, 65536)
                    if chunk:
                        stdin_buf += chunk
                        while b'\n' in stdin_buf:
                            line, stdin_buf = stdin_buf.split(b'\n', 1)
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                cmd = json.loads(line.decode('utf-8'))
                                if cmd['type'] == 'input':
                                    raw = base64.b64decode(cmd['data'])
                                    os.write(master_fd, raw)
                                elif cmd['type'] == 'resize':
                                    set_winsize(master_fd, cmd['rows'], cmd['cols'])
                                    try:
                                        os.kill(pid, signal.SIGWINCH)
                                    except OSError:
                                        pass
                                elif cmd['type'] == 'close':
                                    child_exited = True
                                    break
                            except (json.JSONDecodeError, KeyError, OSError):
                                pass
                except OSError:
                    pass
        # Check if child process has exited (non-blocking)
        if not child_exited:
            try:
                rpid, status = os.waitpid(pid, os.WNOHANG)
                if rpid != 0:
                    child_exited = True
            except ChildProcessError:
                child_exited = True
        # If child exited, drain remaining master_fd output then break
        if child_exited:
            import time
            time.sleep(0.1)
            try:
                while True:
                    leftover = os.read(master_fd, 65536)
                    if not leftover:
                        break
                    send_msg({'type': 'output', 'data': base64.b64encode(leftover).decode('ascii')})
            except OSError:
                pass
            break
    exit_code = -1
    if not child_exited:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    try:
        rpid, status = os.waitpid(pid, os.WNOHANG if child_exited else 0)
        if rpid != 0:
            exit_code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else -1
    except ChildProcessError:
        pass
    send_msg({'type': 'exit', 'code': exit_code})
    try:
        os.close(master_fd)
    except OSError:
        pass
`;
}

let ptyHelperPath = '';
async function ensurePtyHelper() {
  if (!ptyHelperPath) {
    ptyHelperPath = '/tmp/.mcp_pty_helper.py';
    await fs.promises.writeFile(ptyHelperPath, ptyHelperScript(), { mode: 0o755 });
  }
}

function createPtySession(id, cwd, asRoot, cols, rows) {
  const config = { cols, rows, shell: '/bin/bash', cwd };
  const encoded = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');
  const args = asRoot
    ? ['-c', `sudo -n -- python3 ${ptyHelperPath} ${shellQuote(encoded)}`]
    : ['-c', `python3 ${ptyHelperPath} ${shellQuote(encoded)}`];
  const child = spawnCb('/bin/bash', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: '/',
  });
  const session = {
    id,
    child,
    outputBuffer: [],
    outputBufferSize: 0,
    alive: true,
    asRoot,
    cols,
    rows,
    exitCode: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    waiters: [],
  };
  let lineBuf = '';
  child.stdout.on('data', (chunk) => {
    lineBuf += chunk.toString();
    let idx;
    while ((idx = lineBuf.indexOf('\n')) >= 0) {
      const line = lineBuf.slice(0, idx).trim();
      lineBuf = lineBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'output' && msg.data) {
          const buf = Buffer.from(msg.data, 'base64');
          session.outputBuffer.push(buf);
          session.outputBufferSize += buf.length;
          while (session.outputBufferSize > PTY_OUTPUT_BUFFER_MAX && session.outputBuffer.length > 1) {
            const dropped = session.outputBuffer.shift();
            session.outputBufferSize -= dropped.length;
          }
          session.updatedAt = Date.now();
          // Wake any long-poll waiters
          for (const waiter of session.waiters) {
            waiter();
          }
          session.waiters = [];
        } else if (msg.type === 'exit') {
          session.alive = false;
          session.exitCode = msg.code;
          session.updatedAt = Date.now();
          for (const waiter of session.waiters) {
            waiter();
          }
          session.waiters = [];
        }
      } catch {}
    }
  });
  child.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) {
      // Inject stderr as a synthetic output line so the client can see errors
      const buf = Buffer.from(`\r\n\x1b[31m[pty-helper stderr] ${msg}\x1b[0m\r\n`);
      session.outputBuffer.push(buf);
      session.outputBufferSize += buf.length;
      session.updatedAt = Date.now();
      for (const waiter of session.waiters) {
        waiter();
      }
      session.waiters = [];
    }
  });
  child.on('exit', () => {
    session.alive = false;
    session.updatedAt = Date.now();
    for (const waiter of session.waiters) {
      waiter();
    }
    session.waiters = [];
  });
  ptySessions.set(id, session);
  return session;
}

function destroyPtySession(id) {
  const session = ptySessions.get(id);
  if (!session) return;
  session.alive = false;
  for (const waiter of session.waiters) {
    waiter();
  }
  session.waiters = [];
  try {
    session.child.stdin.write(JSON.stringify({ type: 'close' }) + '\n');
  } catch {}
  setTimeout(() => {
    try { session.child.kill('SIGKILL'); } catch {}
  }, 3000).unref();
  session.outputBuffer = [];
  session.outputBufferSize = 0;
  ptySessions.delete(id);
}

function drainPtyOutput(session) {
  if (session.outputBuffer.length === 0) {
    return {
      data_base64: '',
      alive: session.alive,
      exit_code: session.alive ? undefined : session.exitCode,
    };
  }
  const data = Buffer.concat(session.outputBuffer);
  session.outputBuffer = [];
  session.outputBufferSize = 0;
  session.updatedAt = Date.now();
  return {
    data_base64: data.toString('base64'),
    alive: session.alive,
    exit_code: session.alive ? undefined : session.exitCode,
  };
}

function sweepSessions() {
  const now = Date.now();
  for (const [id, entry] of shellSessions.entries()) {
    if (now - entry.updatedAt > SESSION_IDLE_MS) {
      shellSessions.delete(id);
    }
  }
  for (const [id, entry] of uploadSessions.entries()) {
    if (now - entry.updatedAt > SESSION_IDLE_MS) {
      cleanupUploadSession(entry).catch(() => {});
      uploadSessions.delete(id);
    }
  }
  for (const [id, entry] of downloadSessions.entries()) {
    if (now - entry.updatedAt > SESSION_IDLE_MS) {
      downloadSessions.delete(id);
    }
  }
  for (const [id, entry] of ptySessions.entries()) {
    if (now - entry.updatedAt > SESSION_IDLE_MS) {
      destroyPtySession(id);
    }
  }
}
setInterval(sweepSessions, 5 * 60 * 1000).unref();

function parseCommandMarkers(stdout, token) {
  const exitRe = new RegExp(`\\n__MCP_EXIT_${token}__(\\-?\\d+)\\n?`);
  const cwdRe = new RegExp(`__MCP_CWD_${token}__(.*?)(?:\\n|$)`);
  const exitMatch = stdout.match(exitRe);
  const cwdMatch = stdout.match(cwdRe);
  let clean = stdout.replace(exitRe, '\n').replace(cwdRe, '');
  return {
    cleanStdout: clean,
    exitCode: exitMatch ? Number(exitMatch[1]) : null,
    cwd: cwdMatch ? cwdMatch[1].trim() : null,
  };
}

async function runCommandWithContext(command, { cwd='.', timeoutSeconds=120, asRoot=false } = {}) {
  const marker = randomBytes(6).toString('hex');
  const wrapped = `{ ${command}; }; __mcp_rc=$?; printf '\n__MCP_EXIT_${marker}__%s\n' "$__mcp_rc"; printf '__MCP_CWD_${marker}__%s\n' "$PWD"`;
  try {
    const completed = await execShell(wrapped, { cwd, timeoutSeconds, asRoot });
    const parsed = parseCommandMarkers(completed.stdout ?? '', marker);
    return {
      ok: (parsed.exitCode ?? 0) === 0,
      timed_out: false,
      exit_code: parsed.exitCode ?? 0,
      stdout: truncateText(parsed.cleanStdout ?? '', MAX_COMMAND_OUTPUT_BYTES),
      stderr: truncateText(completed.stderr ?? '', MAX_COMMAND_OUTPUT_BYTES),
      as_root: asRoot,
      cwd: parsed.cwd ?? cwd,
    };
  } catch (error) {
    const parsed = parseCommandMarkers(error?.stdout ?? '', marker);
    return {
      ok: false,
      timed_out: error?.killed === true,
      exit_code: parsed.exitCode ?? (typeof error?.code === 'number' ? error.code : null),
      stdout: truncateText(parsed.cleanStdout ?? error?.stdout ?? '', MAX_COMMAND_OUTPUT_BYTES),
      stderr: truncateText(error?.stderr ?? error?.message ?? '', MAX_COMMAND_OUTPUT_BYTES),
      as_root: asRoot,
      cwd: parsed.cwd ?? cwd,
    };
  }
}

async function writeBinaryPart(target, contentBase64, asRoot) {
  if (asRoot) {
    return runRootFileOp({ op: 'write_binary_part', path: target, content_base64: contentBase64, max_file_bytes: MAX_FILE_BYTES });
  }
  const data = Buffer.from(contentBase64, 'base64');
  if (data.length > MAX_FILE_BYTES) {
    throw new Error(`payload exceeds max size ${MAX_FILE_BYTES} bytes`);
  }
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, data);
  const info = await fileStat(target);
  return { ...info, written: data.length };
}

async function mergeBinaryParts(partsDir, dest, expectedSize, asRoot) {
  if (asRoot) {
    return runRootFileOp({ op: 'merge_binary_parts', path: partsDir, dest, expected_size: expectedSize });
  }
  const names = (await fs.promises.readdir(partsDir))
    .filter((name) => /^\d+\.part$/.test(name))
    .sort((a, b) => Number(a.split('.', 1)[0]) - Number(b.split('.', 1)[0]));
  let cursor = 0;
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const tempPath = `${dest}.tmp-${randomBytes(6).toString('hex')}`;
  const out = await fs.promises.open(tempPath, 'w');
  try {
    for (const name of names) {
      const offset = Number(name.split('.', 1)[0]);
      const full = path.join(partsDir, name);
      const data = await fs.promises.readFile(full);
      if (offset !== cursor) {
        throw new Error(`missing or overlapping part at offset=${offset}, expected=${cursor}`);
      }
      await out.write(data, 0, data.length, offset);
      cursor += data.length;
    }
  } finally {
    await out.close();
  }
  if (expectedSize !== null && expectedSize !== undefined && cursor !== expectedSize) {
    await fs.promises.rm(tempPath, { force: true });
    throw new Error(`merged size ${cursor} does not match expected_size=${expectedSize}`);
  }
  const info = await renameAnyPath(tempPath, dest, false);
  return { ...info, merged_parts: names.length, merged_bytes: cursor };
}

async function statAnyPath(target, asRoot) {
  if (asRoot) {
    return runRootFileOp({ op: 'path_info', path: target });
  }
  return fileStat(target);
}

async function renameAnyPath(src, dest, asRoot) {
  if (asRoot) {
    return runRootFileOp({ op: 'rename_path', path: src, dest });
  }
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.rename(src, dest);
  return fileStat(dest);
}

async function deleteAnyPath(target, recursive, asRoot) {
  if (asRoot) {
    return runRootFileOp({ op: 'delete_path', path: target, recursive });
  }
  await fs.promises.rm(target, { recursive, force: false });
}

async function readBinaryChunk(target, offset, chunkBytes, asRoot) {
  if (asRoot) {
    return runRootFileOp({ op: 'read_binary_chunk', path: target, offset, chunk_bytes: chunkBytes });
  }
  const fd = await fs.promises.open(target, 'r');
  try {
    const stat = await fd.stat();
    const buffer = Buffer.alloc(Math.min(chunkBytes, Math.max(0, stat.size - offset)));
    const { bytesRead } = await fd.read(buffer, 0, buffer.length, offset);
    const slice = buffer.subarray(0, bytesRead);
    return {
      path: target,
      size: stat.size,
      modified: new Date(stat.mtimeMs).toISOString(),
      is_dir: stat.isDirectory(),
      is_file: stat.isFile(),
      offset,
      bytes_read: bytesRead,
      done: offset + bytesRead >= stat.size,
      content_base64: slice.toString('base64'),
    };
  } finally {
    await fd.close();
  }
}

function makeServer() {
  const server = new McpServer(
    {
      name: 'bianbu-remote-control',
      version: SERVER_VERSION,
    },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    'health',
    { description: 'Return basic MCP server health information.' },
    async () => {
      const mem = process.memoryUsage();
      const payload = {
        ok: true,
        listen: `${HOST}:${PORT}${MCP_PATH}`,
        file_root: FILE_ROOT,
        max_file_bytes: MAX_FILE_BYTES,
        max_command_output_bytes: MAX_COMMAND_OUTPUT_BYTES,
        max_request_body_bytes: MAX_REQUEST_BODY_BYTES,
        transport_mode: MCP_TRANSPORT_MODE,
        running_uid: process.getuid(),
        has_sudo: HAS_SUDO,
        passwordless_sudo_expected: ENABLE_PASSWORDLESS_SUDO,
        session_idle_ms: SESSION_IDLE_MS,
        logical_session_limits: {
          shell: MAX_SHELL_SESSIONS,
          upload: MAX_UPLOAD_SESSIONS,
          download: MAX_DOWNLOAD_SESSIONS,
          pty: MAX_PTY_SESSIONS,
        },
        active_sessions: {
          shell: shellSessions.size,
          upload: uploadSessions.size,
          download: downloadSessions.size,
          pty: ptySessions.size,
        },
        concurrency: {
          max_concurrent_requests: MAX_CONCURRENT_REQUESTS,
          active_requests: activeRequests,
          total_requests: totalRequests,
          throttled_requests: throttledRequests,
        },
        uptime_seconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
        memory: {
          rss_mb: Math.round(mem.rss / 1048576 * 10) / 10,
          heap_used_mb: Math.round(mem.heapUsed / 1048576 * 10) / 10,
          heap_total_mb: Math.round(mem.heapTotal / 1048576 * 10) / 10,
        },
        node_version: process.version,
        platform: `${os.platform()} ${os.release()} ${os.arch()}`,
        script_version: INSTALLER_SCRIPT_VERSION,
        server_version: SERVER_VERSION,
        service_name: 'bianbu-mcp-server',
        tools: SUPPORTED_TOOLS,
        supports: {
          chunked_transfers: true,
          parallel_chunk_offsets: true,
          rename_path: true,
          shell_session: true,
          rate_limiting: true,
          iso_timestamps: true,
          pty_session: true,
        },
      };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'list_directory',
    {
      description: 'List one directory level and return metadata for each entry.',
      inputSchema: {
        path: z.string().default('.').describe('Absolute path or path relative to FILE_ROOT.'),
        as_root: z.boolean().default(false).describe('Use sudo/root privileges when true.'),
      },
    },
    async ({ path: inputPath, as_root }) => {
      const target = await resolveRequestedPath(inputPath, as_root);
      if (as_root) {
        const payload = await runRootFileOp({ op: 'list_directory', path: target });
        return textResult(JSON.stringify(payload.items, null, 2), payload);
      }

      const stat = await fs.promises.stat(target).catch(() => null);
      if (!stat) {
        throw new Error(`path not found: ${target}`);
      }
      if (!stat.isDirectory()) {
        throw new Error(`not a directory: ${target}`);
      }

      const names = await fs.promises.readdir(target);
      const items = [];
      for (const name of names.sort((a, b) => a.localeCompare(b))) {
        items.push(await fileStat(path.join(target, name)));
      }
      return textResult(JSON.stringify(items, null, 2), { items });
    },
  );

  server.registerTool(
    'read_text_file',
    {
      description: 'Read a UTF-8 text file from the remote host.',
      inputSchema: {
        path: z.string().describe('Absolute path or path relative to FILE_ROOT.'),
        max_bytes: z.number().int().positive().default(262144),
        encoding: z.string().default('utf-8'),
        as_root: z.boolean().default(false).describe('Use sudo/root privileges when true.'),
      },
    },
    async ({ path: inputPath, max_bytes, encoding, as_root }) => {
      const target = await resolveRequestedPath(inputPath, as_root);
      if (as_root) {
        const payload = await runRootFileOp({ op: 'read_text_file', path: target, max_bytes, encoding });
        return textResult(payload.content, payload);
      }
      const stat = await fs.promises.stat(target).catch(() => null);
      if (!stat || !stat.isFile()) {
        throw new Error(`file not found: ${target}`);
      }
      if (stat.size > max_bytes) {
        throw new Error(`file exceeds max_bytes=${max_bytes}: ${target}`);
      }
      const content = await fs.promises.readFile(target, { encoding });
      return textResult(content, { path: target, content });
    },
  );

  server.registerTool(
    'write_text_file',
    {
      description: 'Write a UTF-8 text file to the remote host.',
      inputSchema: {
        path: z.string().describe('Absolute path or path relative to FILE_ROOT.'),
        content: z.string(),
        overwrite: z.boolean().default(true),
        encoding: z.string().default('utf-8'),
        as_root: z.boolean().default(false).describe('Use sudo/root privileges when true.'),
      },
    },
    async ({ path: inputPath, content, overwrite, encoding, as_root }) => {
      const target = await resolveRequestedPath(inputPath, as_root);
      if (as_root) {
        const payload = await runRootFileOp({ op: 'write_text_file', path: target, content, overwrite, encoding });
        return textResult(JSON.stringify(payload, null, 2), payload);
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if (!overwrite) {
        const exists = await fs.promises.stat(target).then(() => true).catch(() => false);
        if (exists) {
          throw new Error(`target exists and overwrite=false: ${target}`);
        }
      }
      const tempPath = `${target}.tmp-${randomBytes(6).toString('hex')}`;
      await fs.promises.writeFile(tempPath, content, { encoding });
      await fs.promises.rename(tempPath, target);
      const info = await fileStat(target);
      return textResult(JSON.stringify(info, null, 2), info);
    },
  );

  server.registerTool(
    'upload_binary_file',
    {
      description: 'Upload a binary file to the remote host using base64 content.',
      inputSchema: {
        path: z.string().describe('Absolute path or path relative to FILE_ROOT.'),
        content_base64: z.string().describe('Base64-encoded file content.'),
        overwrite: z.boolean().default(true),
        as_root: z.boolean().default(false).describe('Use sudo/root privileges when true.'),
      },
    },
    async ({ path: inputPath, content_base64, overwrite, as_root }) => {
      const data = Buffer.from(content_base64, 'base64');
      if (data.length > MAX_FILE_BYTES) {
        throw new Error(`payload exceeds max size ${MAX_FILE_BYTES} bytes`);
      }
      const target = await resolveRequestedPath(inputPath, as_root);
      if (as_root) {
        const payload = await runRootFileOp({ op: 'upload_binary_file', path: target, content_base64, overwrite, max_file_bytes: MAX_FILE_BYTES });
        return textResult(JSON.stringify(payload, null, 2), payload);
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if (!overwrite) {
        const exists = await fs.promises.stat(target).then(() => true).catch(() => false);
        if (exists) {
          throw new Error(`target exists and overwrite=false: ${target}`);
        }
      }
      const tempPath = `${target}.tmp-${randomBytes(6).toString('hex')}`;
      await fs.promises.writeFile(tempPath, data);
      await fs.promises.rename(tempPath, target);
      const info = await fileStat(target);
      return textResult(JSON.stringify(info, null, 2), info);
    },
  );

  server.registerTool(
    'download_binary_file',
    {
      description: 'Download a binary file from the remote host as base64.',
      inputSchema: {
        path: z.string().describe('Absolute path or path relative to FILE_ROOT.'),
        max_bytes: z.number().int().positive().default(MAX_FILE_BYTES),
        as_root: z.boolean().default(false).describe('Use sudo/root privileges when true.'),
      },
    },
    async ({ path: inputPath, max_bytes, as_root }) => {
      const target = await resolveRequestedPath(inputPath, as_root);
      if (as_root) {
        const payload = await runRootFileOp({ op: 'download_binary_file', path: target, max_bytes });
        const size = Buffer.from(payload.content_base64 || '', 'base64').length;
        return textResult(JSON.stringify({ ...payload, content_base64: `[base64:${size} bytes]` }, null, 2), payload);
      }
      const stat = await fs.promises.stat(target).catch(() => null);
      if (!stat || !stat.isFile()) {
        throw new Error(`file not found: ${target}`);
      }
      if (stat.size > max_bytes) {
        throw new Error(`file exceeds max_bytes=${max_bytes}: ${target}`);
      }
      const content = await fs.promises.readFile(target);
      const payload = {
        ...(await fileStat(target)),
        content_base64: content.toString('base64'),
      };
      return textResult(JSON.stringify({ ...payload, content_base64: `[base64:${content.length} bytes]` }, null, 2), payload);
    },
  );

  server.registerTool(
    'make_directory',
    {
      description: 'Create a directory on the remote host.',
      inputSchema: {
        path: z.string().describe('Absolute path or path relative to FILE_ROOT.'),
        parents: z.boolean().default(true),
        as_root: z.boolean().default(false).describe('Use sudo/root privileges when true.'),
      },
    },
    async ({ path: inputPath, parents, as_root }) => {
      const target = await resolveRequestedPath(inputPath, as_root);
      if (as_root) {
        const payload = await runRootFileOp({ op: 'make_directory', path: target, parents });
        return textResult(JSON.stringify(payload, null, 2), payload);
      }
      await fs.promises.mkdir(target, { recursive: parents });
      const info = await fileStat(target);
      return textResult(JSON.stringify(info, null, 2), info);
    },
  );

  server.registerTool(
    'delete_path',
    {
      description: 'Delete a file or directory on the remote host.',
      inputSchema: {
        path: z.string().describe('Absolute path or path relative to FILE_ROOT.'),
        recursive: z.boolean().default(false),
        as_root: z.boolean().default(false).describe('Use sudo/root privileges when true.'),
      },
    },
    async ({ path: inputPath, recursive, as_root }) => {
      const target = await resolveRequestedPath(inputPath, as_root);
      if (as_root) {
        const payload = await runRootFileOp({ op: 'delete_path', path: target, recursive });
        return textResult(JSON.stringify(payload, null, 2), payload);
      }
      const info = await fileStat(target).catch(() => null);
      if (!info) {
        throw new Error(`path not found: ${target}`);
      }
      if (info.is_dir && !recursive) {
        throw new Error(`path is directory, set recursive=true: ${target}`);
      }
      await fs.promises.rm(target, { recursive, force: false });
      return textResult(JSON.stringify({ ok: true, ...info }, null, 2), { ok: true, ...info });
    },
  );

  server.registerTool(
    'rename_path',
    {
      description: 'Atomically rename or move a file or directory on the remote host.',
      inputSchema: {
        path: z.string().describe('Existing source path.'),
        dest: z.string().describe('Destination path.'),
        as_root: z.boolean().default(false).describe('Use sudo/root privileges when true.'),
      },
    },
    async ({ path: inputPath, dest, as_root }) => {
      const source = await resolveRequestedPath(inputPath, as_root);
      const target = await resolveRequestedPath(dest, as_root);
      const info = await renameAnyPath(source, target, as_root);
      return textResult(JSON.stringify(info, null, 2), info);
    },
  );

  server.registerTool(
    'run_command',
    {
      description: 'Run a shell command on the remote host and return stdout/stderr/exit_code.',
      inputSchema: {
        command: z.string().describe('Command executed by /bin/bash -lc'),
        cwd: z.string().default('.').describe('Absolute path or path relative to FILE_ROOT.'),
        timeout_seconds: z.number().int().positive().max(1800).default(120),
        as_root: z.boolean().default(false).describe('Use sudo/root privileges when true.'),
      },
    },
    async ({ command, cwd, timeout_seconds, as_root }) => {
      const workingDirectory = await resolveRequestedPath(cwd, as_root);
      const stat = await fs.promises.stat(workingDirectory).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        throw new Error(`cwd not found or not a directory: ${workingDirectory}`);
      }

      const payload = await runCommandWithContext(command, {
        cwd: workingDirectory,
        timeoutSeconds: timeout_seconds,
        asRoot: as_root,
      });
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'open_shell_session',
    {
      description: 'Open a logical shell session for repeated commands with persistent cwd/as_root state.',
      inputSchema: {
        cwd: z.string().default('.'),
        as_root: z.boolean().default(false),
      },
    },
    async ({ cwd, as_root }) => {
      if (shellSessions.size >= MAX_SHELL_SESSIONS) {
        throw new Error(`shell session limit reached (max ${MAX_SHELL_SESSIONS})`);
      }
      const workingDirectory = await resolveRequestedPath(cwd, as_root);
      const stat = await fs.promises.stat(workingDirectory).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        throw new Error(`cwd not found or not a directory: ${workingDirectory}`);
      }
      const session_id = newSessionId('shell');
      const payload = { session_id, cwd: workingDirectory, as_root, created_at: Date.now() };
      shellSessions.set(session_id, { ...payload, updatedAt: Date.now() });
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'exec_shell_session',
    {
      description: 'Execute a command inside a logical shell session.',
      inputSchema: {
        session_id: z.string(),
        command: z.string(),
        timeout_seconds: z.number().int().positive().max(1800).default(120),
      },
    },
    async ({ session_id, command, timeout_seconds }) => {
      const session = shellSessions.get(session_id);
      if (!session) {
        throw new Error(`unknown shell session: ${session_id}`);
      }
      const payload = await runCommandWithContext(command, {
        cwd: session.cwd,
        timeoutSeconds: timeout_seconds,
        asRoot: session.as_root,
      });
      session.cwd = payload.cwd || session.cwd;
      session.updatedAt = Date.now();
      payload.session_id = session_id;
      payload.session_cwd = session.cwd;
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'close_shell_session',
    {
      description: 'Close a logical shell session.',
      inputSchema: {
        session_id: z.string(),
      },
    },
    async ({ session_id }) => {
      shellSessions.delete(session_id);
      const payload = { ok: true, session_id };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  // ── PTY session tools ──────────────────────────────────────────

  server.registerTool(
    'open_pty_session',
    {
      description: 'Open a real PTY shell session with streaming I/O. Use write_pty_input to send keystrokes and read_pty_output to receive terminal output.',
      inputSchema: {
        cwd: z.string().default('.'),
        as_root: z.boolean().default(false),
        cols: z.number().int().min(1).max(500).default(80),
        rows: z.number().int().min(1).max(200).default(24),
      },
    },
    async ({ cwd, as_root, cols, rows }) => {
      if (ptySessions.size >= MAX_PTY_SESSIONS) {
        throw new Error(`pty session limit reached (max ${MAX_PTY_SESSIONS})`);
      }
      const workingDirectory = await resolveRequestedPath(cwd, as_root);
      const stat = await fs.promises.stat(workingDirectory).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        throw new Error(`cwd not found or not a directory: ${workingDirectory}`);
      }
      await ensurePtyHelper();
      const session_id = newSessionId('pty');
      const session = createPtySession(session_id, workingDirectory, as_root, cols, rows);
      // Wait briefly to detect immediate crash
      await new Promise(r => setTimeout(r, 200));
      if (!session.alive) {
        ptySessions.delete(session_id);
        throw new Error('PTY session exited immediately — check that python3 is available and the working directory is accessible');
      }
      const payload = { session_id, cwd: workingDirectory, as_root, cols, rows };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'write_pty_input',
    {
      description: 'Send raw terminal input (keystrokes) to a PTY session.',
      inputSchema: {
        session_id: z.string(),
        data_base64: z.string(),
      },
    },
    async ({ session_id, data_base64 }) => {
      const session = ptySessions.get(session_id);
      if (!session) throw new Error(`unknown pty session: ${session_id}`);
      if (!session.alive) throw new Error(`pty session is no longer alive: ${session_id}`);
      const msg = JSON.stringify({ type: 'input', data: data_base64 }) + '\n';
      session.child.stdin.write(msg);
      session.updatedAt = Date.now();
      const payload = { ok: true, session_id };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'read_pty_output',
    {
      description: 'Read buffered output from a PTY session. Supports long-polling: holds the request up to timeout_ms if no data is available yet.',
      inputSchema: {
        session_id: z.string(),
        timeout_ms: z.number().int().min(0).max(10000).default(5000),
      },
    },
    async ({ session_id, timeout_ms }) => {
      const session = ptySessions.get(session_id);
      if (!session) throw new Error(`unknown pty session: ${session_id}`);
      session.updatedAt = Date.now();
      // Immediate return if data or dead
      if (session.outputBuffer.length > 0 || !session.alive) {
        const payload = drainPtyOutput(session);
        return textResult(JSON.stringify(payload, null, 2), payload);
      }
      // Long-poll: wait for data or timeout
      const maxWait = Math.min(timeout_ms, 10000);
      const result = await new Promise((resolve) => {
        let resolved = false;
        const finish = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          const idx = session.waiters.indexOf(waiter);
          if (idx >= 0) session.waiters.splice(idx, 1);
          resolve(drainPtyOutput(session));
        };
        const waiter = finish;
        session.waiters.push(waiter);
        const timer = setTimeout(finish, maxWait);
      });
      return textResult(JSON.stringify(result, null, 2), result);
    },
  );

  server.registerTool(
    'resize_pty',
    {
      description: 'Resize a PTY session terminal.',
      inputSchema: {
        session_id: z.string(),
        cols: z.number().int().min(1).max(500),
        rows: z.number().int().min(1).max(200),
      },
    },
    async ({ session_id, cols, rows }) => {
      const session = ptySessions.get(session_id);
      if (!session) throw new Error(`unknown pty session: ${session_id}`);
      if (!session.alive) throw new Error(`pty session is no longer alive: ${session_id}`);
      const msg = JSON.stringify({ type: 'resize', cols, rows }) + '\n';
      session.child.stdin.write(msg);
      session.cols = cols;
      session.rows = rows;
      session.updatedAt = Date.now();
      const payload = { ok: true, session_id, cols, rows };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'close_pty_session',
    {
      description: 'Close a PTY session.',
      inputSchema: {
        session_id: z.string(),
      },
    },
    async ({ session_id }) => {
      destroyPtySession(session_id);
      const payload = { ok: true, session_id };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'upload_chunked_begin',
    {
      description: 'Begin a chunked upload session.',
      inputSchema: {
        path: z.string(),
        overwrite: z.boolean().default(true),
        total_size: z.number().int().nonnegative().optional(),
        chunk_bytes: z.number().int().positive().max(MAX_FILE_BYTES).optional(),
        as_root: z.boolean().default(false),
      },
    },
    async ({ path: inputPath, overwrite, total_size, chunk_bytes, as_root }) => {
      if (uploadSessions.size >= MAX_UPLOAD_SESSIONS) {
        throw new Error(`upload session limit reached (max ${MAX_UPLOAD_SESSIONS})`);
      }
      const target = await resolveRequestedPath(inputPath, as_root);
      const targetExists = await statAnyPath(target, as_root).then(() => true).catch(() => false);
      if (!overwrite && targetExists) {
        throw new Error(`target exists and overwrite=false: ${target}`);
      }
      const upload_id = newSessionId('upload');
      const temp_dir = `${target}.upload-${randomBytes(6).toString('hex')}`;
      const parts_dir = path.join(temp_dir, 'parts');
      const merge_path = path.join(temp_dir, 'merged.bin');
      if (as_root) {
        await runRootFileOp({ op: 'make_directory', path: parts_dir, parents: true });
      } else {
        await fs.promises.mkdir(parts_dir, { recursive: true });
      }
      uploadSessions.set(upload_id, {
        upload_id,
        target,
        temp_dir,
        parts_dir,
        merge_path,
        overwrite,
        as_root,
        total_size: total_size ?? null,
        chunk_bytes: chunk_bytes ?? null,
        bytes_received: 0,
        next_offset: 0,
        parts: new Map(),
        updatedAt: Date.now(),
      });
      const payload = { upload_id, path: target, temp_dir, parts_dir, overwrite, as_root, total_size: total_size ?? null, chunk_bytes: chunk_bytes ?? null, bytes_received: 0 };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'upload_chunked_part',
    {
      description: 'Write a base64 chunk to an upload session, optionally at an explicit offset for parallel uploads.',
      inputSchema: {
        upload_id: z.string(),
        content_base64: z.string(),
        offset: z.number().int().nonnegative().optional(),
      },
    },
    async ({ upload_id, content_base64, offset }) => {
      const session = uploadSessions.get(upload_id);
      if (!session) {
        throw new Error(`unknown upload session: ${upload_id}`);
      }
      const chunkSize = Buffer.from(content_base64, 'base64').length;
      const effectiveOffset = offset ?? session.next_offset;
      const partPath = path.join(session.parts_dir, `${effectiveOffset}.part`);
      const stat = await writeBinaryPart(partPath, content_base64, session.as_root);
      const previousSize = session.parts.get(effectiveOffset) ?? 0;
      session.parts.set(effectiveOffset, chunkSize);
      session.bytes_received += chunkSize - previousSize;
      session.next_offset = Math.max(session.next_offset, effectiveOffset + chunkSize);
      session.updatedAt = Date.now();
      const payload = { upload_id, offset: effectiveOffset, part_size: chunkSize, bytes_received: session.bytes_received, parts_dir: session.parts_dir, stat };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'upload_chunked_finish',
    {
      description: 'Finalize a chunked upload session.',
      inputSchema: {
        upload_id: z.string(),
      },
    },
    async ({ upload_id }) => {
      const session = uploadSessions.get(upload_id);
      if (!session) {
        throw new Error(`unknown upload session: ${upload_id}`);
      }
      const merged = await mergeBinaryParts(session.parts_dir, session.merge_path, session.total_size, session.as_root);
      const info = await renameAnyPath(session.merge_path, session.target, session.as_root);
      await cleanupUploadSession(session);
      uploadSessions.delete(upload_id);
      const payload = { upload_id, ok: true, merged_parts: merged.merged_parts ?? session.parts.size, merged_bytes: merged.merged_bytes ?? session.bytes_received, ...info };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'upload_chunked_abort',
    {
      description: 'Abort and discard a chunked upload session.',
      inputSchema: {
        upload_id: z.string(),
      },
    },
    async ({ upload_id }) => {
      const session = uploadSessions.get(upload_id);
      if (!session) {
        throw new Error(`unknown upload session: ${upload_id}`);
      }
      await cleanupUploadSession(session);
      uploadSessions.delete(upload_id);
      const payload = { upload_id, ok: true };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'download_chunked_begin',
    {
      description: 'Begin a chunked download session.',
      inputSchema: {
        path: z.string(),
        chunk_bytes: z.number().int().positive().max(MAX_FILE_BYTES).default(262144),
        as_root: z.boolean().default(false),
      },
    },
    async ({ path: inputPath, chunk_bytes, as_root }) => {
      if (downloadSessions.size >= MAX_DOWNLOAD_SESSIONS) {
        throw new Error(`download session limit reached (max ${MAX_DOWNLOAD_SESSIONS})`);
      }
      const target = await resolveRequestedPath(inputPath, as_root);
      const info = await statAnyPath(target, as_root);
      if (!info.is_file) {
        throw new Error(`file not found: ${target}`);
      }
      const download_id = newSessionId('download');
      downloadSessions.set(download_id, { download_id, target, chunk_bytes, as_root, offset: 0, updatedAt: Date.now(), total_size: info.size });
      const payload = { download_id, path: target, chunk_bytes, total_size: info.size, offset: 0, as_root };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  server.registerTool(
    'download_chunked_part',
    {
      description: 'Read a chunk from a download session. If offset is provided, supports parallel range-style reads.',
      inputSchema: {
        download_id: z.string(),
        offset: z.number().int().nonnegative().optional(),
        chunk_bytes: z.number().int().positive().max(MAX_FILE_BYTES).optional(),
      },
    },
    async ({ download_id, offset, chunk_bytes }) => {
      const session = downloadSessions.get(download_id);
      if (!session) {
        throw new Error(`unknown download session: ${download_id}`);
      }
      const effectiveOffset = offset ?? session.offset;
      const effectiveChunkBytes = chunk_bytes ?? session.chunk_bytes;
      const payload = await readBinaryChunk(session.target, effectiveOffset, effectiveChunkBytes, session.as_root);
      if (offset === undefined) {
        session.offset = effectiveOffset + payload.bytes_read;
      }
      session.updatedAt = Date.now();
      payload.download_id = download_id;
      payload.next_offset = effectiveOffset + payload.bytes_read;
      return textResult(JSON.stringify({ ...payload, content_base64: `[base64:${payload.bytes_read} bytes]` }, null, 2), payload);
    },
  );

  server.registerTool(
    'download_chunked_close',
    {
      description: 'Close a chunked download session.',
      inputSchema: {
        download_id: z.string(),
      },
    },
    async ({ download_id }) => {
      downloadSessions.delete(download_id);
      const payload = { ok: true, download_id };
      return textResult(JSON.stringify(payload, null, 2), payload);
    },
  );

  return server;
}

const app = express();
app.use(express.json({ limit: EXPRESS_JSON_LIMIT }));
const transports = new Map();
const servers = new Map();

// Concurrency-based rate limiting middleware for MCP endpoint
function rateLimitMiddleware(req, res, next) {
  totalRequests++;
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    throttledRequests++;
    res.setHeader('Retry-After', '1');
    res.status(429).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: `Too many concurrent requests (limit: ${MAX_CONCURRENT_REQUESTS})` },
      id: null,
    });
    return;
  }
  activeRequests++;
  res.on('finish', () => { activeRequests--; });
  res.on('close', () => { activeRequests = Math.max(0, activeRequests - 1); });
  next();
}

app.get('/health', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    listen: `${HOST}:${PORT}${MCP_PATH}`,
    file_root: FILE_ROOT,
    transport_mode: MCP_TRANSPORT_MODE,
    max_request_body_bytes: MAX_REQUEST_BODY_BYTES,
    session_idle_ms: SESSION_IDLE_MS,
    logical_session_limits: {
      shell: MAX_SHELL_SESSIONS,
      upload: MAX_UPLOAD_SESSIONS,
      download: MAX_DOWNLOAD_SESSIONS,
    },
    active_sessions: {
      shell: shellSessions.size,
      upload: uploadSessions.size,
      download: downloadSessions.size,
    },
    concurrency: {
      max_concurrent_requests: MAX_CONCURRENT_REQUESTS,
      active_requests: activeRequests,
      total_requests: totalRequests,
      throttled_requests: throttledRequests,
    },
    uptime_seconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    memory: {
      rss_mb: Math.round(mem.rss / 1048576 * 10) / 10,
      heap_used_mb: Math.round(mem.heapUsed / 1048576 * 10) / 10,
    },
    node_version: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    script_version: INSTALLER_SCRIPT_VERSION,
    server_version: SERVER_VERSION,
    tools: SUPPORTED_TOOLS,
    supports: {
      chunked_transfers: true,
      parallel_chunk_offsets: true,
      rename_path: true,
      shell_session: true,
      rate_limiting: true,
      iso_timestamps: true,
    },
  });
});

app.post(MCP_PATH, rateLimitMiddleware, async (req, res) => {
  try {
    if (MCP_TRANSPORT_MODE === 'stateless') {
      const server = makeServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } finally {
        await transport.close().catch(() => {});
        await server.close().catch(() => {});
      }
      return;
    }

    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport && !sessionId && isInitializeRequest(req.body)) {
      const server = makeServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport);
          servers.set(newSessionId, server);
        },
        onsessionclosed: (closedSessionId) => {
          if (closedSessionId) {
            transports.delete(closedSessionId);
            servers.delete(closedSessionId);
          }
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          transports.delete(sid);
          servers.delete(sid);
        }
      };
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!transport) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP POST request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get(MCP_PATH, async (req, res) => {
  if (MCP_TRANSPORT_MODE !== 'stateful') {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'GET is disabled in stateless mode.' }, id: null });
    return;
  }

  try {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid or missing session ID' }, id: null });
      return;
    }
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP GET request:', error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

app.delete(MCP_PATH, async (req, res) => {
  if (MCP_TRANSPORT_MODE !== 'stateful') {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'DELETE is disabled in stateless mode.' }, id: null });
    return;
  }

  try {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid or missing session ID' }, id: null });
      return;
    }
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP DELETE request:', error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

const listener = app;
const httpServer = TLS_CERT_FILE && TLS_KEY_FILE
  ? https.createServer({ cert: fs.readFileSync(TLS_CERT_FILE), key: fs.readFileSync(TLS_KEY_FILE) }, listener)
  : http.createServer(listener);

httpServer.listen(PORT, HOST, () => {
  const scheme = TLS_CERT_FILE && TLS_KEY_FILE ? 'https' : 'http';
  console.log(`Bianbu MCP server listening at ${scheme}://${HOST}:${PORT}${MCP_PATH} (${MCP_TRANSPORT_MODE})`);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

async function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  // Clean up upload sessions (remove temp dirs)
  const cleanups = [];
  for (const [id, session] of uploadSessions.entries()) {
    cleanups.push(cleanupUploadSession(session).catch(() => {}));
    uploadSessions.delete(id);
  }
  downloadSessions.clear();
  shellSessions.clear();
  for (const [id] of ptySessions) {
    destroyPtySession(id);
  }
  await Promise.allSettled(cleanups);
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => process.exit(0), 10000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
EOF
  run_as_root python3 - "$app_file" "$SERVER_VERSION" "$SCRIPT_VERSION" <<'PY'
from pathlib import Path
import sys

app_file = Path(sys.argv[1])
server_version = sys.argv[2]
script_version = sys.argv[3]
text = app_file.read_text(encoding='utf-8')
text = text.replace('__SERVER_VERSION__', server_version)
text = text.replace('__SCRIPT_VERSION__', script_version)
app_file.write_text(text, encoding='utf-8')
PY
}

install_node_modules() {
  local install_root="${1:-$INSTALL_ROOT}"
  ensure_node_version
  log "安装 Node 依赖到: $install_root"
  run_as_root rm -rf "$install_root/node_modules" "$install_root/package-lock.json"
  run_as_root sh -c "cd '$install_root' && npm install --omit=dev --no-fund --no-audit"
  run_as_root test -f "$install_root/node_modules/@modelcontextprotocol/sdk/package.json" || die "npm 安装后缺少 @modelcontextprotocol/sdk"
  run_as_root test -f "$install_root/node_modules/express/package.json" || die "npm 安装后缺少 express"
  run_as_root test -f "$install_root/node_modules/zod/package.json" || die "npm 安装后缺少 zod"
  run_as_root chmod -R a+rX "$install_root/node_modules"
  run_as_root sh -c "cd '$install_root' && node -e \"import('./server.mjs').then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); })\"" || die "Node 运行时无法解析 MCP server"
}

prepare_release_root() {
  local release_root="$1"
  local release_package_file="${release_root}/package.json"
  local release_app_file="${release_root}/server.mjs"

  log "预构建新版本到暂存目录: $release_root"
  run_as_root rm -rf "$release_root"
  run_as_root install -d -m 755 "$release_root"
  write_package "$release_package_file"
  write_app "$release_app_file"
  install_node_modules "$release_root"
}

activate_release_root() {
  local release_root="$1"
  local previous_root="$2"

  stop_existing_service_if_needed

  if run_as_root test -d "$INSTALL_ROOT"; then
    log "暂存当前安装目录: $INSTALL_ROOT -> $previous_root"
    run_as_root rm -rf "$previous_root"
    run_as_root mv "$INSTALL_ROOT" "$previous_root"
  fi

  log "切换新版本安装目录: $release_root -> $INSTALL_ROOT"
  run_as_root rm -rf "$INSTALL_ROOT"
  run_as_root mv "$release_root" "$INSTALL_ROOT"
}

clear_release_rollback_state() {
  ROLLBACK_ON_EXIT=0
  ROLLBACK_BACKUP_DIR=""
  ROLLBACK_STAGING_ROOT=""
  ROLLBACK_PREVIOUS_ROOT=""
}

cleanup_release_artifacts() {
  local release_root="$1"
  local previous_root="$2"

  run_as_root rm -rf "$release_root" >/dev/null 2>&1 || true
  run_as_root rm -rf "$previous_root" >/dev/null 2>&1 || true
}

write_env() {
  write_root_file "$ENV_FILE" 600 <<EOF
HOST=${HOST}
PORT=${PORT}
MCP_PATH=${MCP_PATH}
MCP_TRANSPORT_MODE=${MCP_TRANSPORT_MODE}
RUN_USER=${RUN_USER}
RUN_GROUP=${RUN_GROUP}
FILE_ROOT=${FILE_ROOT}
ENABLE_PASSWORDLESS_SUDO=${ENABLE_PASSWORDLESS_SUDO}
MAX_FILE_MB=${MAX_FILE_MB}
MAX_COMMAND_OUTPUT_KB=${MAX_COMMAND_OUTPUT_KB}
MAX_REQUEST_BODY_MB=${MAX_REQUEST_BODY_MB}
MAX_CONCURRENT_REQUESTS=${MAX_CONCURRENT_REQUESTS}
MAX_UPLOAD_SESSIONS=${MAX_UPLOAD_SESSIONS}
MAX_DOWNLOAD_SESSIONS=${MAX_DOWNLOAD_SESSIONS}
MAX_SHELL_SESSIONS=${MAX_SHELL_SESSIONS}
MAX_PTY_SESSIONS=${MAX_PTY_SESSIONS}
TLS_CERT_FILE=${TLS_CERT_FILE}
TLS_KEY_FILE=${TLS_KEY_FILE}
EOF
}

write_service() {
  write_root_file "$SERVICE_FILE" 644 <<EOF
[Unit]
Description=Bianbu MCP Server
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
EnvironmentFile=-${ENV_FILE}
WorkingDirectory=${INSTALL_ROOT}
User=${RUN_USER}
Group=${RUN_GROUP}
ExecStart=/usr/bin/env node ${APP_FILE}
Restart=always
RestartSec=5
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF
}

cmd_install() {
  if ! command -v apt-get >/dev/null 2>&1; then
    die "当前系统没有 apt-get，脚本按 Debian/Ubuntu/Bianbu OS 体系编写"
  fi

  log "安装依赖: nodejs npm curl ca-certificates python3 sudo"
  run_as_root apt-get update
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
    nodejs npm curl ca-certificates python3 sudo
  ensure_node_version
  log "依赖安装完成"
}

log_release_summary() {
  log "健康检查: curl http://127.0.0.1:${PORT}/health"
  if [ -n "$TLS_CERT_FILE" ] && [ -n "$TLS_KEY_FILE" ]; then
    log "MCP 地址: https://<你的主机>:${PORT}${MCP_PATH}"
  else
    log "MCP 地址: http://<你的主机>:${PORT}${MCP_PATH}"
    log "警告: 当前未配置 TLS。公网使用时请设置 TLS_CERT_FILE/TLS_KEY_FILE 或放在 HTTPS 反向代理后。"
  fi
  log "MCP 传输模式: ${MCP_TRANSPORT_MODE}"
  log "脚本版本: ${SCRIPT_VERSION}，服务版本: ${SERVER_VERSION}"
}

apply_release() {
  local release_id
  local staging_root
  local previous_root

  require_systemd
  cmd_install
  ensure_runtime_user
  configure_passwordless_sudo
  backup_existing_installation

  release_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  staging_root="${INSTALL_ROOT}.staging-${release_id}"
  previous_root="${INSTALL_ROOT}.previous-${release_id}"

  prepare_release_root "$staging_root"

  ROLLBACK_ON_EXIT=1
  ROLLBACK_BACKUP_DIR="$LAST_BACKUP_DIR"
  ROLLBACK_STAGING_ROOT="$staging_root"
  ROLLBACK_PREVIOUS_ROOT="$previous_root"

  activate_release_root "$staging_root" "$previous_root"
  write_env
  write_service
  finalize_service_start

  clear_release_rollback_state
  cleanup_release_artifacts "$staging_root" "$previous_root"
}

cmd_bootstrap() {
  apply_release
  log "bootstrap 完成"
  log_release_summary
}

cmd_start() {
  require_systemd
  run_as_root systemctl start "$SERVICE_NAME"
}

cmd_stop() {
  require_systemd
  run_as_root systemctl stop "$SERVICE_NAME"
}

cmd_restart() {
  require_systemd
  finalize_service_start
}

cmd_repair() {
  apply_release
  log "repair 完成"
  log_release_summary
}

cmd_recover() {
  cmd_bootstrap
}

cmd_restore_latest() {
  require_systemd
  local latest_backup
  latest_backup="$(run_as_root sh -c "ls -1dt '${BACKUP_ROOT}'/* 2>/dev/null | head -n 1")"
  [ -n "$latest_backup" ] || die "未找到可恢复的备份目录: $BACKUP_ROOT"

  stop_existing_service_if_needed

  if run_as_root test -d "$latest_backup/install_root"; then
    log "恢复安装目录: $latest_backup/install_root -> $INSTALL_ROOT"
    run_as_root rm -rf "$INSTALL_ROOT"
    run_as_root cp -a "$latest_backup/install_root" "$INSTALL_ROOT"
  fi

  if run_as_root test -f "$latest_backup/${SERVICE_NAME}.service"; then
    log "恢复 systemd service"
    run_as_root cp -a "$latest_backup/${SERVICE_NAME}.service" "$SERVICE_FILE"
  fi

  if run_as_root test -f "$latest_backup/${SERVICE_NAME}.env"; then
    log "恢复环境文件"
    run_as_root cp -a "$latest_backup/${SERVICE_NAME}.env" "$ENV_FILE"
  fi

  finalize_service_start
  log "已从备份恢复: $latest_backup"
  log_release_summary
}

cmd_status() {
  require_systemd
  run_as_root systemctl --no-pager --full status "$SERVICE_NAME"
}

cmd_logs() {
  require_systemd
  run_as_root journalctl -u "$SERVICE_NAME" --no-pager "$@"
}

cmd_show_config() {
  cat <<EOF
SERVICE_NAME=${SERVICE_NAME}
SCRIPT_VERSION=${SCRIPT_VERSION}
SERVER_VERSION=${SERVER_VERSION}
HOST=${HOST}
PORT=${PORT}
MCP_PATH=${MCP_PATH}
MCP_TRANSPORT_MODE=${MCP_TRANSPORT_MODE}
RUN_USER=${RUN_USER}
RUN_GROUP=${RUN_GROUP}
FILE_ROOT=${FILE_ROOT}
ENABLE_PASSWORDLESS_SUDO=${ENABLE_PASSWORDLESS_SUDO}
MAX_FILE_MB=${MAX_FILE_MB}
MAX_COMMAND_OUTPUT_KB=${MAX_COMMAND_OUTPUT_KB}
MAX_REQUEST_BODY_MB=${MAX_REQUEST_BODY_MB}
MAX_CONCURRENT_REQUESTS=${MAX_CONCURRENT_REQUESTS}
MAX_UPLOAD_SESSIONS=${MAX_UPLOAD_SESSIONS}
MAX_DOWNLOAD_SESSIONS=${MAX_DOWNLOAD_SESSIONS}
MAX_SHELL_SESSIONS=${MAX_SHELL_SESSIONS}
MAX_PTY_SESSIONS=${MAX_PTY_SESSIONS}
TLS_CERT_FILE=${TLS_CERT_FILE}
TLS_KEY_FILE=${TLS_KEY_FILE}
BACKUP_ROOT=${BACKUP_ROOT}
EOF
}

cmd_version() {
  cat <<EOF
SCRIPT_VERSION=${SCRIPT_VERSION}
SERVER_VERSION=${SERVER_VERSION}
APP_NAME=${APP_NAME}
INSTALL_ROOT=${INSTALL_ROOT}
SERVICE_NAME=${SERVICE_NAME}
EOF
}

cleanup_failed_release() {
  local exit_code="${1:-0}"
  local backup_dir="$ROLLBACK_BACKUP_DIR"
  local staging_root="$ROLLBACK_STAGING_ROOT"
  local previous_root="$ROLLBACK_PREVIOUS_ROOT"

  if [ "$ROLLBACK_ON_EXIT" -ne 1 ] || [ "$exit_code" -eq 0 ]; then
    return 0
  fi

  clear_release_rollback_state
  set +e

  log "检测到发布失败，尝试自动回滚到上一版本"

  if command -v systemctl >/dev/null 2>&1; then
    if service_file_exists && run_as_root systemctl is-active --quiet "$SERVICE_NAME"; then
      log "停止失败中的服务进程: $SERVICE_NAME"
      run_as_root systemctl stop "$SERVICE_NAME" || true
    fi
  fi

  if [ -n "$staging_root" ]; then
    run_as_root rm -rf "$staging_root" >/dev/null 2>&1 || true
  fi

  if [ -n "$previous_root" ] && run_as_root test -d "$previous_root"; then
    log "回滚安装目录: $previous_root -> $INSTALL_ROOT"
    run_as_root rm -rf "$INSTALL_ROOT"
    run_as_root mv "$previous_root" "$INSTALL_ROOT"
  elif [ -n "$backup_dir" ] && run_as_root test -d "$backup_dir/install_root"; then
    log "从备份恢复安装目录: $backup_dir/install_root -> $INSTALL_ROOT"
    run_as_root rm -rf "$INSTALL_ROOT"
    run_as_root cp -a "$backup_dir/install_root" "$INSTALL_ROOT"
  fi

  if [ -n "$backup_dir" ] && run_as_root test -f "$backup_dir/${SERVICE_NAME}.service"; then
    log "回滚 systemd service"
    run_as_root cp -a "$backup_dir/${SERVICE_NAME}.service" "$SERVICE_FILE" || true
  fi

  if [ -n "$backup_dir" ] && run_as_root test -f "$backup_dir/${SERVICE_NAME}.env"; then
    log "回滚环境文件"
    run_as_root cp -a "$backup_dir/${SERVICE_NAME}.env" "$ENV_FILE" || true
  fi

  if command -v systemctl >/dev/null 2>&1 && service_file_exists; then
    run_as_root systemctl daemon-reload || true
    run_as_root systemctl reset-failed "$SERVICE_NAME" || true
    run_as_root systemctl enable --now "$SERVICE_NAME" || true
    run_as_root systemctl restart "$SERVICE_NAME" || true
    if wait_for_local_health 25 2; then
      log "自动回滚完成，远端已恢复到上一可用版本"
    else
      log "自动回滚后健康检查仍未通过，请执行 '$SCRIPT_NAME restore-latest'"
      run_as_root systemctl --no-pager --full status "$SERVICE_NAME" || true
      run_as_root journalctl -u "$SERVICE_NAME" -n 120 --no-pager || true
    fi
  fi
}

trap 'exit_code=$?; trap - EXIT; cleanup_failed_release "$exit_code"; exit "$exit_code"' EXIT

main() {
  local cmd="${1:-up}"
  shift || true

  case "$cmd" in
    install) cmd_install "$@" ;;
    up) cmd_recover "$@" ;;
    bootstrap) cmd_bootstrap "$@" ;;
    start) cmd_start "$@" ;;
    stop) cmd_stop "$@" ;;
    restart) cmd_restart "$@" ;;
    status) cmd_status "$@" ;;
    recover) cmd_recover "$@" ;;
    repair) cmd_repair "$@" ;;
    restore-latest) cmd_restore_latest "$@" ;;
    version) cmd_version "$@" ;;
    logs) cmd_logs "$@" ;;
    show-config) cmd_show_config "$@" ;;
    help|-h|--help) usage ;;
    *) die "未知命令: $cmd，执行 '$SCRIPT_NAME help' 查看帮助" ;;
  esac
}

main "$@"
