#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  build-deb.sh — Packaging Postulator en .deb
#  Usage : ./build-deb.sh [version]
#  Exemple : ./build-deb.sh 1.5.1
# ─────────────────────────────────────────────────────────────
set -e

VERSION="${1:-1.5.1}"
DEB_NAME="postulator_${VERSION}_amd64.deb"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="${SCRIPT_DIR}/packaging"
DIST_DIR="${SCRIPT_DIR}/dist"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Build Postulator .deb — v${VERSION}      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Vérifications ─────────────────────────────────────────────
if ! command -v dpkg-deb &>/dev/null; then
    echo -e "${RED}✗ dpkg-deb non trouvé. Installez : sudo apt install dpkg-dev${NC}"
    exit 1
fi

# ── Mise à jour version dans control ──────────────────────────
echo -e "${YELLOW}[1/5] Mise à jour de la version dans packaging/DEBIAN/control...${NC}"
sed -i "s/^Version:.*/Version: ${VERSION}/" "${PKG_DIR}/DEBIAN/control"
echo -e "      ${GREEN}✓ Version mise à jour : ${VERSION}${NC}"

# ── Build frontend ─────────────────────────────────────────────
echo -e "${YELLOW}[2/5] Build frontend React...${NC}"
cd "${SCRIPT_DIR}/frontend"
if [ ! -d "node_modules" ]; then
    npm install --silent
fi
npm run build
echo -e "      ${GREEN}✓ Frontend buildé${NC}"
cd "${SCRIPT_DIR}"

# ── Sync backend → packaging ────────────────────────────────────
echo -e "${YELLOW}[3/5] Synchronisation sources backend...${NC}"
rsync -a --delete \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='*.db' \
    --exclude='*.db-shm' \
    --exclude='*.db-wal' \
    --exclude='.env' \
    --exclude='uploads/' \
    --exclude='logs/' \
    --exclude='automation_config.json' \
    "${SCRIPT_DIR}/backend/" \
    "${PKG_DIR}/opt/postulator/backend/"
echo -e "      ${GREEN}✓ Backend synchronisé${NC}"

# ── Sync frontend → packaging ────────────────────────────────────
echo -e "${YELLOW}[4/5] Synchronisation sources frontend...${NC}"
rsync -a --delete \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.cache' \
    "${SCRIPT_DIR}/frontend/" \
    "${PKG_DIR}/opt/postulator/frontend/"
echo -e "      ${GREEN}✓ Frontend synchronisé${NC}"

# ── Build .deb ─────────────────────────────────────────────────
echo -e "${YELLOW}[5/5] Construction du paquet .deb...${NC}"
mkdir -p "${DIST_DIR}"
chmod 755 "${PKG_DIR}/DEBIAN/postinst"
dpkg-deb --build "${PKG_DIR}" "${DIST_DIR}/${DEB_NAME}"

SIZE=$(du -sh "${DIST_DIR}/${DEB_NAME}" | cut -f1)
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Paquet créé avec succès !                      ║${NC}"
echo -e "${GREEN}║   Fichier : dist/${DEB_NAME}    ║${NC}"
echo -e "${GREEN}║   Taille  : ${SIZE}                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Upload sur GitHub release (si gh disponible) ───────────────
if command -v gh &>/dev/null; then
    echo -e "${YELLOW}Upload sur GitHub release v${VERSION}...${NC}"
    gh release upload "v${VERSION}" "${DIST_DIR}/${DEB_NAME}" --clobber
    echo -e "${GREEN}✓ Asset uploadé : ${DEB_NAME}${NC}"
else
    echo -e "${YELLOW}⚠ gh CLI non disponible — upload manuel :${NC}"
    echo -e "  gh release upload v${VERSION} dist/${DEB_NAME}"
fi
