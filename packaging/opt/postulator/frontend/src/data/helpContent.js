/**
 * src/data/helpContent.js
 * Contenu d'aide contextuel par route.
 */

export const HELP_CONTENT = {

  '/dashboard': {
    title: 'Overview — Tableau de bord',
    intro: 'Vue d\'ensemble de votre activité de recherche d\'emploi. Tout est mis à jour en temps réel dès qu\'une action est effectuée.',
    sections: [
      { title: 'KPIs', icon: '📊', content: 'Les 4 cartes affichent : offres en base, offres scrapées aujourd\'hui, score IA moyen, offres "À postuler". Se mettent à jour après chaque scraping.' },
      { title: 'Graphique d\'ingestion', icon: '📈', content: 'Courbe des 7 derniers jours montrant le volume d\'offres ajoutées par jour. Utile pour identifier les meilleurs moments de scraping.' },
      { title: 'Top Matches', icon: '⭐', content: 'Offres ayant le meilleur score IA (≥ 80%) analysées par Ollama. Pour en obtenir, allez dans CV Intelligence → Analyser le match.' },
      { title: 'Mode démonstration', icon: 'ℹ️', content: 'Si le backend n\'est pas démarré, des données fictives s\'affichent. Une bannière bleue l\'indique.' },
    ],
  },

  '/cv': {
    title: 'CV — Gestion de vos CVs',
    intro: 'Créez et gérez plusieurs versions de votre CV. Chaque CV sera utilisé pour générer des CVs adaptés aux offres.',
    sections: [
      { title: 'Créer / Importer', icon: '➕', content: 'Cliquez "Nouveau CV" pour partir de zéro, ou "Importer PDF" pour qu\'Ollama analyse votre CV existant et remplisse automatiquement toutes les sections (1-3 min).' },
      { title: 'Éditer les sections', icon: '✏️', content: 'Cliquez sur le titre d\'une section pour l\'ouvrir. Texte libre ou Markdown supporté. Utilisez ## Poste · Entreprise pour les expériences.' },
      { title: 'Sauvegarde', icon: '💾', content: 'Les modifications NE sont PAS sauvegardées automatiquement — cliquez sur "Sauvegarder" avant de changer de page.' },
    ],
  },

  '/jobs': {
    title: 'Offres — Liste des offres scrapées',
    intro: 'Toutes les offres collectées. Filtrez, triez, et gérez le statut de chaque offre.',
    sections: [
      { title: 'Filtres', icon: '🔍', content: 'Filtrez par texte, source, lieu (ville ou pays), statut pipeline, score IA minimum, remote. Les filtres se combinent. Le filtre Lieu fait une recherche partielle (ex: "Zürich" ou "Switzerland").' },
      { title: 'Score en masse', icon: '🤖', content: 'Le bouton "Scorer avec mon CV" dans la barre de filtres lance l\'analyse Ollama sur plusieurs offres d\'un coup. Choisissez le CV et le nombre d\'offres. Résultats visibles dans les Alertes.' },
      { title: 'Résumé IA ✨', icon: '✨', content: 'Si l\'icône ✨ (teal) apparaît dans les actions, c\'est qu\'Ollama a généré un résumé ou une analyse pour cette offre. Cliquez pour voir le détail dans le panneau latéral.' },
      { title: 'Panneau de détail', icon: '📋', content: 'Cliquez sur une ligne pour voir la description complète, le score détaillé (points forts / lacunes / recommandation) et les chips de statut pipeline.' },
    ],
  },

  '/jobs-intelligence': {
    title: 'Offres Intelligence — Chat IA',
    intro: 'Interrogez Ollama sur n\'importe quelle offre scrapée. Posez vos questions en langage naturel — interprétation, compétences, culture d\'entreprise, niveau requis…',
    sections: [
      { title: 'Sélectionner une offre', icon: '🔍', content: 'Tapez dans la combobox pour filtrer parmi toutes vos offres (titre, entreprise). Cliquez sur une offre pour la sélectionner — une fiche de résumé apparaît.' },
      { title: 'Poser une question', icon: '💬', content: 'Tapez votre question dans le champ en bas, puis appuyez sur Entrée (ou le bouton →). Vous pouvez aussi cliquer sur une des suggestions à gauche pour poser une question prédéfinie.' },
      { title: 'Annuler une réponse', icon: '⏹️', content: 'Si Ollama met trop longtemps, cliquez sur "Annuler" dans l\'indicateur de réflexion. La minuterie affiche le temps écoulé en temps réel.' },
      { title: 'Conversation', icon: '🗣️', content: 'Chaque sélection d\'offre démarre une nouvelle conversation. Vous pouvez poser plusieurs questions successives sur la même offre — Ollama garde le contexte de l\'offre mais pas de vos questions précédentes.' },
      { title: 'Limites', icon: '⚠️', content: 'Si l\'offre n\'a pas de description (offres Jobsch, Jobup parfois), Ollama répondra à partir du titre uniquement. La qualité des réponses dépend de la richesse de la description de l\'offre.' },
    ],
  },

  '/scrapers': {
    title: 'Scrapers — Collecte automatique d\'offres',
    intro: 'Lancez la collecte automatique d\'offres depuis plusieurs sources. Les scrapers tournent en arrière-plan via Celery.',
    sections: [
      { title: 'Lancer un scraping', icon: '🚀', content: 'Remplissez les mots-clés, optionnellement une localisation, sélectionnez les sources, et lancez avec ou sans proxy. Le scraping tourne en arrière-plan.' },
      { title: 'Sources', icon: '📡', content: '🌍 International : Indeed (meilleure couverture), LinkedIn, Glassdoor, ZipRecruiter, Adzuna (API officielle). 🇨🇭 Suisse : Jobup.ch, Jobs.ch, JobTeaser. Utilisez le preset "🇨🇭 Tout Suisse" pour activer les 4 sources suisses d\'un coup.' },
      { title: 'Mode ESCO', icon: '📚', content: 'Activez le mode ESCO pour rechercher avec les termes officiels du dictionnaire européen des métiers et compétences. Tapez au moins 2 caractères pour voir les suggestions.' },
      { title: 'Résumé IA ✨', icon: '✨', content: 'Le toggle "Résumé IA" génère automatiquement un résumé en 10 bullet points pour les 10 premières offres après chaque scraping. Disponible dans le panneau de détail de chaque offre.' },
      { title: 'Proxies', icon: '🛡️', content: 'Utilisez des proxies résidentiels (format IP:PORT:USER:PASS) pour protéger votre IP et éviter les blocages. Recommandé pour Indeed et LinkedIn.' },
      { title: 'Audit Trail', icon: '📝', content: 'Cliquez sur une ligne du tableau pour voir le détail : proxy utilisé, proxies tentés, offres trouvées/nouvelles, durée. Utile pour diagnostiquer les problèmes.' },
    ],
  },

  '/analysis': {
    title: 'CV Intelligence — Analyse IA',
    intro: 'Analysez la compatibilité entre votre CV et une offre. Ollama tourne localement — aucune donnée envoyée sur internet.',
    sections: [
      { title: 'Upload et analyse', icon: '📤', content: 'Uploadez un CV PDF/TXT, donnez-lui un nom. Cliquez "Analyser" pour qu\'Ollama extraie les compétences automatiquement (30-60s).' },
      { title: 'Scoring', icon: '🎯', content: 'Sélectionnez une offre, cliquez "Analyser le match". Ollama retourne : score /100, points forts, lacunes, recommandation. 90+ : postulez immédiatement. 75-89 : bon match.' },
      { title: 'Sauvegarder', icon: '💾', content: 'Cliquez "Sauvegarder dans l\'historique" après le scoring pour conserver le résultat dans la page Historique.' },
    ],
  },

  '/cv-matching': {
    title: 'CV Matching — Générer un CV adapté',
    intro: 'Générez automatiquement un CV optimisé pour une offre spécifique. Ollama reformule vos expériences pour maximiser le matching — sans inventer d\'informations.',
    sections: [
      { title: 'Principe', icon: '🤖', content: 'Ollama analyse votre profil et l\'offre, réorganise les sections (plus pertinentes en premier), reformule avec les mots-clés de l\'offre. Rien n\'est inventé.' },
      { title: 'Export', icon: '📥', content: '.txt : texte brut. .md : Markdown éditable. Pour .docx : exportez en .md et ouvrez avec LibreOffice Writer.' },
      { title: 'CV ATS', icon: '📊', content: 'Cliquez "CV ATS" pour obtenir un score de compatibilité avec les systèmes ATS (Applicant Tracking Systems), les mots-clés manquants, et des suggestions d\'amélioration.' },
      { title: 'Historique', icon: '🗂️', content: 'Chaque CV généré est sauvegardé avec : source, offre, date, modèle utilisé. Retrouvez-les dans la liste à gauche.' },
    ],
  },

  '/board': {
    title: 'Pipeline — Kanban de candidatures',
    intro: 'Visualisez et gérez l\'état de vos candidatures sur un tableau Kanban.',
    sections: [
      { title: 'Colonnes', icon: '📌', content: 'À voir → À postuler → Postulé → Entretien → Rejeté. Représente les étapes de votre processus de candidature.' },
      { title: 'Navigation', icon: '🖱️', content: 'Glissez-déposez les cartes entre colonnes, ou utilisez les boutons ← → sur chaque carte.' },
      { title: 'Synchronisation', icon: '🔄', content: 'Le statut est synchronisé avec la page Offres et le panneau de détail. Toute modification est immédiatement reflétée partout.' },
    ],
  },

  '/history': {
    title: 'Historique — Résultats d\'analyses',
    intro: 'Retrouvez tous les résultats d\'analyses CV ↔ offre sauvegardés depuis CV Intelligence.',
    sections: [
      { title: 'Filtres', icon: '🔍', content: 'Filtrez par texte (CV, offre, entreprise), plage de dates (Du / Au), et plage de score (min % – max %). Les filtres date et score sont appliqués côté serveur.' },
      { title: 'Détail', icon: '⬇️', content: 'Cliquez sur une ligne pour voir : synthèse Ollama, points forts, points de développement, modèle utilisé, lien vers l\'offre.' },
      { title: 'Alerte email', icon: '📧', content: 'Cliquez sur l\'icône enveloppe pour envoyer manuellement une alerte email pour ce match (si SMTP configuré dans Paramètres).' },
    ],
  },

  '/job-analysis': {
    title: 'Analyse de l\'offre — Adéquation sémantique',
    intro: 'Évaluez si une offre correspond à votre contenu de poste grâce à une analyse IA sémantique approfondie. Les correspondances sont surlignées en rouge.',
    sections: [
      { title: 'Sélection de l\'offre', icon: '🔍', content: 'Tapez dans la barre de recherche pour filtrer vos offres scrapées. Cliquez sur la flèche pour parcourir toutes les offres. L\'icône verte indique que la description est disponible en BDD ; l\'icône orange signale que l\'IA devra récupérer la page en ligne.' },
      { title: 'Contenu de poste', icon: '📝', content: 'Décrivez librement ce que vous recherchez : "un poste de direction avec management d\'équipe", "développeur senior Python avec expérience cloud", "commercial B2B SaaS en mode chasse". Pas besoin de mots-clés exacts — l\'IA interprète sémantiquement.' },
      { title: 'Surlignage des correspondances', icon: '🔴', content: 'Les éléments de l\'offre correspondant à votre contenu de poste sont surlignés en rouge. L\'IA identifie les correspondances implicites : "pilotage d\'une équipe de managers" → "poste de Direction", même sans le mot exact.' },
      { title: 'Questions de suivi', icon: '💬', content: 'Après l\'analyse initiale, posez des questions de suivi dans la zone de saisie en bas. L\'historique de la conversation est conservé pour la session. Appuyez sur Entrée pour envoyer, Maj+Entrée pour un saut de ligne.' },
      { title: 'Provider IA', icon: '⚡', content: 'Si OpenRouter est configuré dans Paramètres, l\'analyse utilise les modèles cloud gratuits avec fallback automatique. Sinon, Ollama local est utilisé. Le badge en haut à droite indique le provider actif.' },
    ],
  },

  '/settings': {
    title: 'Paramètres — Configuration',
    intro: 'Configuration de Postulator : alertes email, modèle IA, OpenRouter (cloud gratuit), scrapers.',
    sections: [
      { title: 'OpenRouter (cloud gratuit)', icon: '⚡', content: 'OpenRouter donne accès à des modèles IA gratuits (DeepSeek R1, Llama 4, Gemma 3…) sans GPU local. Créez un compte sur openrouter.ai, générez une clé API, collez-la ici. Si configuré, OpenRouter remplace Ollama sur toutes les fonctions IA. Fallback automatique sur le modèle suivant en cas d\'erreur.' },
      { title: 'Alertes email', icon: '📧', content: 'Configurez SMTP dans backend/.env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, ALERT_EMAIL_TO, ALERT_SCORE_THRESHOLD). Cliquez "Tester" pour vérifier. Redémarrez uvicorn après modification.' },
      { title: 'Modèle Ollama', icon: '🤖', content: 'Changez OLLAMA_MODEL dans backend/.env. Modèles recommandés pour 16GB VRAM : phi4-mini (rapide), qwen2.5:14b (équilibré), deepseek-r1:32b (avancé). Non utilisé si OpenRouter est configuré.' },
      { title: 'Adzuna', icon: '🔑', content: 'Inscription gratuite sur developer.adzuna.com. Ajoutez ADZUNA_APP_ID et ADZUNA_APP_KEY dans .env. 10 000 requêtes/mois. Couvre UK, US, DE, FR, AU, CA, NL, AT, BE, IT, PL, SG.' },
    ],
  },

  '/companies': {
    title: 'Entreprises — Scraping ciblé',
    intro: 'Gérez une liste d\'entreprises cibles et scrapez leurs offres directement depuis leur page carrières — sans passer par un agrégateur.',
    sections: [
      { title: 'Ajouter une entreprise', icon: '➕', content: 'Cliquez "+ Entreprise". Deux options : "Rechercher avec DuckDuckGo" pour trouver manuellement l\'URL carrières (recherche par mot-clé avec aperçu des résultats), ou "Découvrir automatiquement" pour que l\'IA trouve et valide l\'URL toute seule.' },
      { title: 'Découverte automatique', icon: '🔍', content: 'Le pipeline IA teste d\'abord les URL courantes (/jobs, /careers, /emplois…), consulte DuckDuckGo pour des résultats ciblés, puis demande à l\'IA de choisir la meilleure URL. Les logs en temps réel montrent chaque étape. Cliquez "Logs" sur une carte pour voir le détail.' },
      { title: 'Recherche DDG manuelle', icon: '🦆', content: 'Choisissez un mot-clé parmi les chips prédéfinies (careers, jobs, emplois…) ou tapez le vôtre. L\'aperçu montre la requête exacte envoyée. Cliquez [Voir] pour ouvrir un résultat dans un onglet, [✅] pour le valider comme URL carrières, puis "Lancer le scraping".' },
      { title: 'Scraping', icon: '⚡', content: 'Une fois l\'URL carrières configurée, cliquez le bouton ▶ pour scraper les offres. Le scraping tourne en arrière-plan. "Tout scraper" lance toutes les entreprises actives en parallèle. Les nouvelles offres apparaissent dans la page Offres.' },
      { title: 'Cloudflare / CAPTCHA', icon: '🛡️', content: 'Certains sites (ex. Nestlé, grandes multinationales) sont protégés par Cloudflare Bot Management. L\'URL est trouvée correctement mais le scraping retourne 403. Solution : proxies résidentiels dans la configuration. Playwright est utilisé pour contourner ~70% des protections JS.' },
      { title: 'Configuration IA', icon: '🤖', content: 'Cliquez l\'icône ⚙ pour configurer le provider IA (Ollama local ou OpenRouter cloud) et les proxies utilisés pendant la découverte. Si OpenRouter est configuré dans Paramètres, sélectionnez-le ici pour de meilleurs résultats.' },
    ],
  },

  '/automation': {
    title: 'Automatisation — Recherche quotidienne',
    intro: 'Recherche automatique quotidienne sur Indeed + LinkedIn avec scoring IA intégré. Paramétrez une fois, Postulator travaille pour vous.',
    sections: [
      { title: 'Mots-clés et opérateurs', icon: '🔍', content: 'AND : les deux termes présents — ex : Python AND senior. OR : l\'un ou l\'autre — ex : DevOps OR SRE. Parenthèses : groupement prioritaire — ex : (Python OR Java) AND senior. Évaluation : parenthèses en premier, puis AND, puis OR.' },
      { title: 'Paramètres fixes', icon: '🔒', content: 'Sources = Indeed + LinkedIn uniquement. Offres publiées dans les 24h. 10 résultats par source. Max 20 offres scorées par run. Ces valeurs sont fixées en dur pour maximiser la fiabilité.' },
      { title: 'Redémarrage auto', icon: '🔄', content: 'À chaque redémarrage d\'uvicorn, Postulator lit automation_config.json et replanifie le job automatiquement. Aucune intervention manuelle nécessaire. Vérifiez les logs : [Automation] Reprise planification.' },
      { title: 'Proxies', icon: '🛡️', content: 'Fortement recommandé pour l\'automatisation longue durée. Les proxies sont sauvegardés avec la config et réutilisés à chaque run quotidien. Format : IP:PORT:USERNAME:PASSWORD, un par ligne.' },
      { title: 'Annulation', icon: '⏹️', content: 'Cliquez "Annuler" dans la barre de progression pour stopper un run en cours. Le scraping Celery et le scoring s\'arrêtent proprement.' },
    ],
  },

}

export const DEFAULT_HELP = {
  title: 'Aide Postulator',
  intro: 'Postulator est un agrégateur de recherche d\'emploi open source avec IA locale (Ollama).',
  sections: [
    { title: 'Flux recommandé', icon: '🧭', content: 'Scrapers → Offres → Offres Intelligence → CV → CV Intelligence → CV Matching → Pipeline → Historique. Ou Automatisation pour un run quotidien complet.' },
    { title: 'IA locale', icon: '🤖', content: 'Toutes les fonctions IA utilisent Ollama sur votre machine. Aucune donnée n\'est envoyée sur internet.' },
    { title: 'Raccourci aide', icon: '?', content: 'Appuyez sur la touche "?" depuis n\'importe quelle page pour ouvrir l\'aide contextuelle.' },
  ],
}
