/**
 * src/data/helpContent.js
 * Contenu d'aide contextuel par route.
 * Chaque entrée contient un titre, une description courte, et une liste de sections.
 */

export const HELP_CONTENT = {

  '/dashboard': {
    title: 'Overview — Tableau de bord',
    intro: 'Vue d\'ensemble de votre activité de recherche d\'emploi. Tout est mis à jour en temps réel dès qu\'une action est effectuée.',
    sections: [
      {
        title: 'KPIs (indicateurs clés)',
        icon: '📊',
        content: 'Les 4 cartes du haut affichent : le nombre total d\'offres en base, les offres scrapées aujourd\'hui, le score IA moyen de vos matches, et le nombre d\'offres en statut "À postuler". Ces chiffres se mettent à jour après chaque scraping.',
      },
      {
        title: 'Graphique d\'ingestion',
        icon: '📈',
        content: 'Courbe des 7 derniers jours montrant le volume d\'offres ajoutées par jour. Utile pour identifier les meilleurs moments de scraping et voir votre activité de recherche.',
      },
      {
        title: 'Logs récents',
        icon: '📋',
        content: 'Historique des dernières sessions de scraping avec la source, le nombre d\'offres trouvées, le nombre de nouvelles offres (dédupliquées), et le statut (succès/erreur).',
      },
      {
        title: 'Top Matches',
        icon: '⭐',
        content: 'Les offres ayant le meilleur score IA (≥ 80%) analysées par Ollama. Cliquez sur une offre pour ouvrir son détail. Pour obtenir des scores, allez dans CV Intelligence et cliquez sur "Analyser le match".',
      },
      {
        title: 'Mode démonstration',
        icon: 'ℹ️',
        content: 'Si le backend n\'est pas démarré, le tableau de bord affiche des données de démonstration. Une bannière bleue l\'indique. Lancez uvicorn et relancez la page pour voir vos vraies données.',
      },
    ],
  },

  '/cv': {
    title: 'CV — Gestion de vos CVs',
    intro: 'Créez et gérez plusieurs versions de votre CV. Chaque CV est stocké en base avec toutes ses sections. C\'est votre "CV source" qui sera utilisé pour générer des CVs adaptés aux offres.',
    sections: [
      {
        title: 'Créer un CV',
        icon: '➕',
        content: 'Cliquez sur "Nouveau CV" pour créer un CV vide. Il sera nommé avec la date du jour. Vous pouvez renommer le CV directement dans l\'éditeur en cliquant sur son titre.',
      },
      {
        title: 'Importer un PDF',
        icon: '📄',
        content: 'Cliquez sur "Importer PDF" et sélectionnez votre CV existant au format PDF. Ollama analyse le document et remplit automatiquement toutes les sections (identité, expériences, compétences, formation, langues…). Cette étape peut prendre 1-3 minutes. Vérifiez et corrigez chaque section après l\'import.',
      },
      {
        title: 'Éditer les sections',
        icon: '✏️',
        content: 'Cliquez sur le titre d\'une section pour l\'ouvrir. Les zones de texte s\'agrandissent automatiquement — aucune limite de hauteur. Écrivez en texte libre ou en Markdown (## Titre, - liste). Pour les expériences, utilisez le format : ## Poste · Entreprise (dates) puis les réalisations avec des tirets.',
      },
      {
        title: 'Plusieurs CVs',
        icon: '📚',
        content: 'Vous pouvez avoir autant de CVs que vous le souhaitez — un par spécialisation, un par langue, un avant/après une formation. Chaque CV est listé à gauche avec sa date de création. Cliquez pour basculer d\'un CV à l\'autre.',
      },
      {
        title: 'Sauvegarde',
        icon: '💾',
        content: 'Cliquez sur "Sauvegarder" en bas de page (barre sticky). Les modifications ne sont PAS sauvegardées automatiquement — pensez à sauvegarder avant de changer de CV ou de quitter la page.',
      },
      {
        title: 'Suppression',
        icon: '🗑️',
        content: 'Le bouton "Supprimer" en bas à gauche supprime définitivement le CV et tous les CVs adaptés générés à partir de celui-ci. Une confirmation est demandée.',
      },
    ],
  },

  '/jobs': {
    title: 'Offres — Liste des offres scrapées',
    intro: 'Toutes les offres d\'emploi collectées par les scrapers. Filtrez, triez, et gérez le statut de chaque offre dans votre pipeline de candidature.',
    sections: [
      {
        title: 'Filtres',
        icon: '🔍',
        content: 'Filtrez par texte (titre/entreprise), source (Indeed, LinkedIn…), statut pipeline, score IA minimum, et offres remote. Les filtres se combinent. Cliquez sur "Réinitialiser" pour tout effacer.',
      },
      {
        title: 'Tri par colonnes',
        icon: '↕️',
        content: 'Cliquez sur les en-têtes de colonnes "Publiée", "Score IA", "Offre" ou "Entreprise" pour trier. Par défaut : les plus récentes en premier. Un second clic inverse l\'ordre. Les offres sans date tombent en fin de liste.',
      },
      {
        title: 'Ouvrir une offre',
        icon: '🔗',
        content: 'Cliquez sur le titre de l\'offre (souligné au survol) pour l\'ouvrir directement dans un nouvel onglet. Cliquez ailleurs sur la ligne pour ouvrir le panneau de détail à droite avec la description complète.',
      },
      {
        title: 'Panneau de détail',
        icon: '📋',
        content: 'Le panneau latéral affiche : métadonnées, salaire, description complète, et les chips de statut pipeline. Cliquez sur un statut (À voir → À postuler → Postulé → Entretien → Rejeté) pour mettre à jour votre pipeline sans quitter la vue.',
      },
      {
        title: 'Score IA',
        icon: '🤖',
        content: 'La colonne "Score IA" affiche le résultat de l\'analyse Ollama (vert ≥ 80%, bleu ≥ 60%, gris = non analysé). Pour obtenir un score, allez dans CV Intelligence → sélectionnez cette offre → Analyser le match.',
      },
      {
        title: 'Export CSV',
        icon: '📥',
        content: 'Le bouton CSV en haut à droite exporte toutes les offres affichées (avec filtres actifs) au format CSV. Le fichier s\'ouvre dans Excel ou LibreOffice Calc.',
      },
    ],
  },

  '/scrapers': {
    title: 'Scrapers — Collecte automatique d\'offres',
    intro: 'Lancez la collecte automatique d\'offres depuis plusieurs sources en simultané. Les scrapers tournent en arrière-plan via Celery — vous pouvez continuer à naviguer pendant la collecte.',
    sections: [
      {
        title: 'Lancer un scraping',
        icon: '🚀',
        content: 'Remplissez les mots-clés (ex: "python developer"), optionnellement une localisation (ex: "Paris" ou laisser vide pour mondial), sélectionnez les sources (Indeed, LinkedIn…), le nombre de résultats, et si vous voulez uniquement des offres remote. Cliquez sur "Lancer le scraping".',
      },
      {
        title: 'Sources disponibles',
        icon: '📡',
        content: 'Indeed est la source la plus fiable et retourne des descriptions complètes. LinkedIn requiert parfois un compte. Glassdoor et ZipRecruiter fonctionnent mieux pour les offres US. Google Jobs agrège plusieurs sources mais sans description détaillée.',
      },
      {
        title: 'Déduplication',
        icon: '🔄',
        content: 'Les offres déjà présentes en base ne sont jamais dupliquées — le système utilise un hash SHA-256 de l\'URL. La colonne "Nouvelles" dans les logs indique les offres réellement ajoutées, "Trouvées" le total avant déduplication.',
      },
      {
        title: 'Logs d\'audit',
        icon: '📝',
        content: 'Chaque session de scraping est enregistrée : source, mots-clés, nombre d\'offres trouvées/nouvelles/doublons, durée, statut. Consultez ces logs pour diagnostiquer les problèmes ou vérifier l\'activité.',
      },
      {
        title: 'Celery requis',
        icon: '⚙️',
        content: 'Le scraping tourne via Celery (worker asynchrone). Si le worker Celery n\'est pas démarré, le scraping sera en attente indéfiniment. Vérifiez que le Terminal 4 (celery worker) est bien actif.',
      },
      {
        title: 'Anti-blocage',
        icon: '🛡️',
        content: 'Un délai aléatoire de 3-10 secondes est appliqué entre chaque requête pour éviter d\'être bloqué par les sites. C\'est normal si le scraping prend quelques secondes avant de démarrer.',
      },
    ],
  },

  '/analysis': {
    title: 'CV Intelligence — Analyse IA',
    intro: 'Analysez la compatibilité entre votre CV et une offre d\'emploi en utilisant Ollama localement. Aucune donnée n\'est envoyée sur internet.',
    sections: [
      {
        title: 'Upload d\'un CV',
        icon: '📤',
        content: 'Glissez-déposez ou cliquez pour uploader un CV (PDF, TXT ou Markdown, max 10 Mo). Donnez-lui un nom pour le retrouver facilement. Ce CV sera utilisé pour l\'extraction de compétences et le scoring.',
      },
      {
        title: 'Analyser (extraction de compétences)',
        icon: '🔬',
        content: 'Cliquez sur "Analyser" sous le CV pour qu\'Ollama extraie automatiquement les compétences techniques et soft skills. Les badges de compétences apparaissent sur la carte CV. Cette étape peut prendre 30-60 secondes.',
      },
      {
        title: 'CV actif',
        icon: '✦',
        content: 'Un seul CV peut être "actif" à la fois pour le scoring. Cliquez sur "Activer" pour le définir comme CV de référence. Le CV actif est marqué "✦ CV actif" et sa bordure devient verte.',
      },
      {
        title: 'Scoring CV ↔ Offre',
        icon: '🎯',
        content: 'Sélectionnez une offre dans le menu déroulant, puis cliquez sur "Analyser le match". Ollama compare le CV actif avec la description de l\'offre et retourne : un score /100, les points forts, les points de développement, et une recommandation.',
      },
      {
        title: 'Interpréter le score',
        icon: '📊',
        content: '90-100 : Correspondance quasi-parfaite, postulez immédiatement. 75-89 : Bon match, quelques points à améliorer. 50-74 : Match partiel, gap significatif. < 50 : Faible correspondance. Le score est indicatif — fiez-vous aussi à votre propre jugement.',
      },
      {
        title: 'Sauvegarder l\'analyse',
        icon: '💾',
        content: 'Après le scoring, cliquez sur "Sauvegarder dans l\'historique" pour conserver le résultat. Retrouvez-le dans la page Historique avec tous les détails. Vous ne pourrez sauvegarder qu\'une fois par analyse (le bouton passe en vert "Sauvegardé").',
      },
    ],
  },

  '/cv-matching': {
    title: 'CV Matching — Générer un CV adapté',
    intro: 'Générez automatiquement une version de votre CV optimisée pour une offre spécifique. Ollama réorganise et reformule vos expériences existantes pour maximiser le matching — sans jamais inventer d\'informations.',
    sections: [
      {
        title: 'Prérequis',
        icon: '📋',
        content: 'Vous devez avoir au moins un CV créé dans la page "CV" et des offres en base (page "Scrapers"). Choisissez le CV source, l\'offre cible, et la langue (Français ou Anglais).',
      },
      {
        title: 'Principe de génération',
        icon: '🤖',
        content: 'Ollama analyse simultanément votre profil et la description de l\'offre. Il réorganise l\'ordre des sections et des expériences (les plus pertinentes en premier), reformule les descriptions avec les mots-clés de l\'offre, et adapte le titre professionnel. Aucune information n\'est inventée.',
      },
      {
        title: 'Visualisation',
        icon: '👁️',
        content: 'Le CV généré s\'affiche à droite avec un rendu Markdown formaté : titre en grand, sections en couleur, listes structurées. C\'est une prévisualisation — le document final sera à retoucher dans votre traitement de texte.',
      },
      {
        title: 'Export du CV',
        icon: '📥',
        content: '.txt : texte brut sans balises Markdown, idéal pour copier-coller. .md : Markdown complet pour éditer avec un éditeur Markdown. .docx : télécharge le fichier .md et affiche une instruction pour l\'ouvrir avec LibreOffice Writer (Fichier > Ouvrir) qui le convertit en .docx.',
      },
      {
        title: 'Historique et traçabilité',
        icon: '🗂️',
        content: 'Chaque CV généré est automatiquement sauvegardé en base avec : le nom du CV source, le titre et l\'entreprise de l\'offre, la date/heure de génération, le modèle Ollama utilisé. Si vous postulez et êtes rappelé, vous savez exactement quel CV vous avez envoyé.',
      },
      {
        title: 'Notes',
        icon: '📌',
        content: 'Ajoutez une note sur chaque CV généré (ex: "Envoyé le 15/03 — réponse positive", "Version en anglais pour le poste remote"). Cliquez sur "Ajouter une note" sous la barre d\'export.',
      },
      {
        title: 'Supprimer et régénérer',
        icon: '🔁',
        content: 'Si le résultat ne vous convient pas, supprimez-le (bouton poubelle rouge) et relancez la génération. Vous pouvez générer autant de versions que vous voulez pour la même offre.',
      },
    ],
  },

  '/board': {
    title: 'Pipeline — Kanban de candidatures',
    intro: 'Visualisez et gérez l\'état de toutes vos candidatures sur un tableau Kanban. Faites glisser les offres d\'une colonne à l\'autre au fur et à mesure de votre avancement.',
    sections: [
      {
        title: 'Colonnes du pipeline',
        icon: '📌',
        content: '"À voir" : nouvelles offres à évaluer. "À postuler" : offres retenues, candidature à envoyer. "Postulé" : candidature envoyée, en attente de réponse. "Entretien" : vous avez été contacté. "Rejeté" : candidature refusée ou abandonnée.',
      },
      {
        title: 'Déplacer une offre',
        icon: '🖱️',
        content: 'Glissez-déposez une carte d\'une colonne à une autre (drag & drop). Vous pouvez aussi utiliser les boutons ← → sur chaque carte pour la déplacer d\'une colonne à la fois sans drag & drop.',
      },
      {
        title: 'Filtrer les offres',
        icon: '🔍',
        content: 'La barre de recherche en haut filtre en temps réel par titre ou entreprise. Pratique quand le pipeline contient beaucoup d\'offres.',
      },
      {
        title: 'Synchronisation',
        icon: '🔄',
        content: 'Le statut modifié dans le Kanban est synchronisé avec la page Offres et le panneau de détail d\'une offre. Toute modification dans une vue est reflétée dans les autres.',
      },
      {
        title: 'Score sur les cartes',
        icon: '🎯',
        content: 'Si une offre a été analysée par Ollama, son score IA apparaît sur la carte (vert ≥ 80%, bleu ≥ 60%). Les offres sans score affichent "—".',
      },
    ],
  },

  '/history': {
    title: 'Historique — Résultats d\'analyses sauvegardés',
    intro: 'Retrouvez tous les résultats d\'analyses CV ↔ offre que vous avez sauvegardés depuis la page CV Intelligence. Cliquez sur une ligne pour voir le détail complet.',
    sections: [
      {
        title: 'Tableau récapitulatif',
        icon: '📋',
        content: 'Chaque ligne affiche : la date/heure de l\'analyse, le nom du CV utilisé avec ses badges de compétences, le titre et l\'entreprise de l\'offre, et le score IA coloré. Cliquez sur une ligne pour l\'agrandir.',
      },
      {
        title: 'Détail expandable',
        icon: '⬇️',
        content: 'En cliquant sur une ligne, vous voyez : la synthèse complète d\'Ollama, la liste des points forts, la liste des points de développement, le modèle Ollama utilisé, la source de l\'offre, et un lien vers l\'offre originale.',
      },
      {
        title: 'Stats rapides',
        icon: '📊',
        content: 'La barre de stats en haut affiche : nombre total d\'analyses, score moyen de toutes vos analyses, et votre meilleur match (offre + score). Utile pour voir en un coup d\'œil si vous ciblez bien les bonnes offres.',
      },
      {
        title: 'Comment sauvegarder',
        icon: '💾',
        content: 'Les entrées de l\'historique proviennent de la page CV Intelligence. Après un scoring, cliquez sur "Sauvegarder dans l\'historique" — le bouton passe en vert "Sauvegardé". Les analyses non sauvegardées sont perdues au rechargement.',
      },
      {
        title: 'Suppression',
        icon: '🗑️',
        content: 'Cliquez sur l\'icône poubelle à droite d\'une ligne pour la supprimer. Cette action est définitive. Les données du CV et de l\'offre liés ne sont pas affectés.',
      },
    ],
  },

}

// Route par défaut si la page n'a pas de contenu d'aide défini
export const DEFAULT_HELP = {
  title: 'Aide Postulator',
  intro: 'Postulator est un agrégateur de recherche d\'emploi open source avec IA locale.',
  sections: [
    {
      title: 'Navigation',
      icon: '🧭',
      content: 'Utilisez le menu latéral pour naviguer entre les pages. Le flux recommandé : Scrapers → Offres → CV → CV Intelligence → CV Matching → Historique.',
    },
    {
      title: 'Intelligence artificielle',
      icon: '🤖',
      content: 'Toutes les fonctionnalités IA (extraction de compétences, scoring, génération de CV) utilisent Ollama localement sur votre machine. Aucune donnée n\'est envoyée sur internet.',
    },
  ],
}
