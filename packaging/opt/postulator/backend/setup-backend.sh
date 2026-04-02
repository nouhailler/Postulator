#!/usr/bin/env bash
# =============================================================================
# setup-backend.sh — Mise en route du backend Postulator (Debian / Ubuntu)
# Testé sur : Debian 13 Trixie, Python 3.13, Python 3.12, Python 3.11
#
# Usage : cd backend && bash setup-backend.sh
# =============================================================================
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BACKEND_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; exit 1; }
section() { echo -e "\n${CYAN}──── $* ────${NC}"; }

# ── 1. Python ────────────────────────────────────────────────────────────────
section "Python"
if ! command -v python3 &>/dev/null; then
    error "python3 non trouvé. Installer : sudo apt install python3"
fi

PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
info "Python $PY_VERSION détecté"

if python3 -c "import sys; exit(0 if sys.version_info >= (3,10) else 1)"; then
    info "Version ≥ 3.10 ✓"
else
    error "Python ≥ 3.10 requis. Version actuelle : $PY_VERSION"
fi

# Avertissement Python 3.13
if [ "$PY_MINOR" -ge 13 ]; then
    warn "Python 3.13 détecté — utilisation des versions compatibles des dépendances."
    warn "greenlet sera installé en premier avec la version ≥ 3.1.0 (seule compatible 3.13)."
fi

# ── 2. Dépendances système (compilateur C++) ─────────────────────────────────
section "Dépendances système"
if command -v apt-get &>/dev/null; then
    MISSING_PKGS=""
    for pkg in python3-dev gcc g++ python3-venv; do
        if ! dpkg -l "$pkg" &>/dev/null 2>&1; then
            MISSING_PKGS="$MISSING_PKGS $pkg"
        fi
    done
    if [ -n "$MISSING_PKGS" ]; then
        warn "Paquets manquants :$MISSING_PKGS"
        warn "Installation : sudo apt-get install -y$MISSING_PKGS"
        echo -e "${YELLOW}Voulez-vous les installer maintenant ? (o/N)${NC} "
        read -r REPLY
        if [[ "$REPLY" =~ ^[Oo]$ ]]; then
            sudo apt-get install -y $MISSING_PKGS
        else
            warn "Installation ignorée — certains packages peuvent échouer."
        fi
    else
        info "Dépendances système OK"
    fi
fi

# ── 3. Environnement virtuel ─────────────────────────────────────────────────
section "Environnement virtuel"
if [ ! -d ".venv" ]; then
    info "Création du venv…"
    python3 -m venv .venv
else
    info "venv existant trouvé"
fi

# shellcheck disable=SC1091
source .venv/bin/activate
info "venv activé : $(which python)"

pip install --upgrade pip setuptools wheel --quiet
info "pip/setuptools/wheel mis à jour"

# ── 4. Installation dépendances (stratégie par étapes) ──────────────────────
section "Dépendances Python — installation par étapes"

# Étape A : greenlet en premier (critique sur Python 3.13)
echo "  → Étape 1/4 : greenlet (dépendance critique)…"
if pip install "greenlet>=3.1.0" --quiet; then
    GREENLET_VER=$(pip show greenlet 2>/dev/null | grep Version | awk '{print $2}')
    info "greenlet $GREENLET_VER installé"
else
    error "Échec greenlet. Vérifiez que g++ et python3-dev sont installés."
fi

# Étape B : SQLAlchemy (dépend de greenlet)
echo "  → Étape 2/4 : SQLAlchemy + aiosqlite…"
pip install "sqlalchemy==2.0.35" "aiosqlite==0.20.0" --quiet
info "SQLAlchemy + aiosqlite installés"

# Étape C : Celery séparé (évite conflit greenlet lors de la résolution)
echo "  → Étape 3/4 : Celery + Redis…"
pip install "celery>=5.4.1" "redis==5.1.1" --quiet
info "Celery + Redis installés"

# Étape D : Reste des dépendances
echo "  → Étape 4/4 : FastAPI, Pydantic, Ollama, PyMuPDF…"
pip install \
    "fastapi==0.115.0" \
    "uvicorn==0.30.6" \
    "alembic==1.13.3" \
    "pydantic==2.9.2" \
    "pydantic-settings==2.5.2" \
    "python-jobspy>=1.1.80" \
    "beautifulsoup4==4.12.3" \
    "httpx==0.27.2" \
    "fake-useragent==1.5.1" \
    "ollama==0.3.3" \
    "pymupdf>=1.24.11" \
    "python-multipart==0.0.12" \
    "python-dotenv==1.0.1" \
    "tenacity==9.0.0" \
    "loguru==0.7.2" \
    --quiet

info "Toutes les dépendances installées ✓"

# Vérification rapide des imports critiques
echo ""
echo "  → Vérification des imports critiques…"
python3 -c "import fastapi; print(f'     fastapi {fastapi.__version__} ✓')"
python3 -c "import sqlalchemy; print(f'     sqlalchemy {sqlalchemy.__version__} ✓')"
python3 -c "import greenlet; print(f'     greenlet {greenlet.__version__} ✓')"
python3 -c "import celery; print(f'     celery {celery.__version__} ✓')"
python3 -c "import pydantic; print(f'     pydantic {pydantic.__version__} ✓')"

# ── 5. Fichier .env ──────────────────────────────────────────────────────────
section "Configuration .env"
if [ ! -f ".env" ]; then
    cp .env.example .env
    info ".env créé depuis .env.example"
else
    info ".env déjà présent"
fi

# ── 6. Vérification Redis ────────────────────────────────────────────────────
section "Redis"
if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null 2>&1; then
    info "Redis actif sur localhost:6379"
else
    warn "Redis non détecté."
    warn "  sudo apt install redis-server && sudo systemctl start redis"
    warn "  Le scraping async (Celery) nécessite Redis."
    warn "  Le scoring synchrone /api/analysis/score-sync reste disponible sans Redis."
fi

# ── 7. Vérification Ollama ───────────────────────────────────────────────────
section "Ollama"
if curl -sf http://localhost:11434/api/version &>/dev/null; then
    MODELS=$(curl -sf http://localhost:11434/api/tags \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(', '.join(m['name'] for m in d.get('models',[])))" \
        2>/dev/null || echo "inconnu")
    info "Ollama actif — Modèles disponibles : $MODELS"
else
    warn "Ollama non détecté sur localhost:11434"
    warn "  Démarrer : ollama serve"
    warn "  Modèle recommandé : ollama pull qwen2.5:14b"
fi

# ── 8. Création des dossiers ─────────────────────────────────────────────────
section "Dossiers de travail"
mkdir -p uploads/cvs logs
info "Dossiers uploads/cvs et logs prêts"

# ── 9. Test démarrage API ────────────────────────────────────────────────────
section "Test import de l'application"
if python3 -c "from app.main import app; print('     app.main importé ✓')" 2>/dev/null; then
    info "Application FastAPI importée sans erreur"
else
    warn "Import app.main a échoué — vérifiez les erreurs ci-dessus."
    warn "Tentez : python3 -c \"from app.main import app\" pour le détail."
fi

# ── 10. Résumé ───────────────────────────────────────────────────────────────
section "Prêt à démarrer !"
echo ""
echo -e "  ${GREEN}Terminal 1${NC} — API FastAPI :"
echo -e "  ${CYAN}cd $(pwd) && source .venv/bin/activate${NC}"
echo -e "  ${CYAN}uvicorn app.main:app --reload --port 8000${NC}"
echo ""
echo -e "  ${GREEN}Terminal 2${NC} — Worker Celery (nécessite Redis) :"
echo -e "  ${CYAN}source .venv/bin/activate${NC}"
echo -e "  ${CYAN}celery -A app.workers.celery_app.celery_app worker --loglevel=info${NC}"
echo ""
echo -e "  ${GREEN}Swagger UI${NC} : http://localhost:8000/docs"
echo -e "  ${GREEN}Health    ${NC} : http://localhost:8000/health"
echo ""
