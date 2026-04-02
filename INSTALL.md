# 📦 Guide d'installation — Postulator

## Installation rapide (.deb)

```bash
# 1. Télécharger
wget https://github.com/nouhailler/postulator/releases/latest/download/postulator_1.0.0_all.deb

# 2. Installer
sudo dpkg -i postulator_1.0.0_all.deb
sudo apt-get install -f   # si des dépendances manquent

# 3. Installer Ollama et un modèle
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull phi3.5:3.8b

# 4. Lancer
postulator
```

## Désinstallation

```bash
sudo apt remove postulator
```

## Mise à jour

```bash
sudo dpkg -i postulator_X.X.X_all.deb
```

## Dépendances système requises

| Paquet | Description |
|--------|-------------|
| `python3 >= 3.11` | Runtime Python |
| `python3-pip` | Gestionnaire de paquets Python |
| `python3-venv` | Environnements virtuels |
| `nodejs >= 18` | Runtime JavaScript |
| `npm` | Gestionnaire de paquets Node |
| `redis-server` | Broker de messages (Celery) |
| `curl` | Téléchargements HTTP |
| `pandoc` *(optionnel)* | Export .docx des CVs générés |

## Fichiers installés

```
/opt/postulator/          → Application complète
/usr/bin/postulator       → Commande de lancement
/usr/share/applications/  → Entrée menu bureau
/usr/share/icons/         → Icône application
~/.postulator/logs/       → Logs runtime (créés au premier lancement)
```

## Configuration

Éditez `/opt/postulator/backend/.env` pour personnaliser :
- Le modèle Ollama utilisé
- Le seuil d'alerte email
- L'URL Redis (si différente de localhost)

## Problèmes courants

**Redis ne démarre pas :**
```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server  # pour démarrer automatiquement
```

**Ollama non disponible :**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama serve &   # démarrer le daemon
ollama pull phi3.5:3.8b
```

**Port 8000 ou 5173 occupé :**
Vérifiez les processus en cours : `lsof -i :8000` et `lsof -i :5173`
