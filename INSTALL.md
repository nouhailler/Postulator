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

---

## Problèmes courants

### ❌ Frontend inaccessible — `ERR_CONNECTION_REFUSED` sur localhost:5173

**Cause** : Vite ne peut pas créer ses fichiers temporaires dans `/opt/postulator/frontend/`
car le dossier appartient à `root` après l'installation.

**Log révélateur** (`~/.postulator/logs/frontend.log`) :
```
Error: EACCES: permission denied, open '/opt/postulator/frontend/vite.config.js.timestamp-...mjs'
```

**Solution** :
```bash
sudo chown -R $USER:$USER /opt/postulator
postulator
```

---

### ❌ Scoring Ollama ne retourne pas de JSON (après mise à jour Ollama ≥ 0.5)

**Cause** : Les nouvelles versions d'Ollama exigent le paramètre `format="json"` explicite
dans les appels `client.generate()`. Sans ce paramètre, Ollama retourne du texte libre
au lieu de JSON structuré, ce qui fait échouer le parsing côté backend.

**Symptôme** : Le scoring affiche une erreur "Réponse non parsable" ou un score de 0.

**Solution** : Ce correctif est intégré depuis la version 1.0.1. Si vous avez une version
antérieure, mettez à jour le paquet :
```bash
sudo dpkg -i postulator_1.0.1_all.deb
```

Ou modifiez manuellement `/opt/postulator/backend/app/services/ollama_service.py` :
dans les deux appels `client.generate()` (fonctions `score_job` et `extract_skills`),
ajoutez la ligne `format="json",` après `stream=False,`.

---

### ❌ Redis ne démarre pas

```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server  # démarrage automatique au boot
```

### ❌ Ollama non disponible

```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama serve &
ollama pull phi3.5:3.8b
```

### ❌ Port 8000 ou 5173 déjà occupé

```bash
lsof -i :8000   # voir quel processus utilise le port
lsof -i :5173
kill <PID>      # tuer le processus si nécessaire
```

### ❌ Consulter les logs en cas de problème

```bash
tail -f ~/.postulator/logs/api.log       # API FastAPI
tail -f ~/.postulator/logs/frontend.log  # Frontend Vite
tail -f ~/.postulator/logs/celery.log    # Worker Celery
tail -f ~/.postulator/logs/redis.log     # Redis
```
