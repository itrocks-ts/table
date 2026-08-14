# Réordonnancement des colonnes — spécifications

## Objet et statut

Ce document définit le comportement attendu de `TableColumnReorder`, puis décrit séparément l'implémentation disponible
à ce jour. Les formulations « doit » et « ne doit pas » appartiennent au contrat fonctionnel ; la section « État de
l'implémentation » est un constat du code actuel.

Le plugin réordonne le DOM de la table. Il ne modifie ni un modèle de données applicatif, ni la configuration d'un
framework, et ne persiste pas l'ordre choisi.

## Spécifications fonctionnelles

### Déclenchement

- La zone de prise est constituée des cellules directes de la première ligne du `thead`. Sans ligne de `thead`, la
  première ligne du premier `tbody` joue ce rôle. Une table sans aucune de ces lignes reste inactive.
- Seuls le pointeur principal et son bouton principal doivent pouvoir armer un déplacement.
- Un lien, bouton, champ de formulaire, contenu éditable ou élément `draggable` placé dans l'en-tête doit conserver son
  interaction propre et ne pas déclencher de réordonnancement.
- Le déplacement commence après un mouvement horizontal supérieur ou égal à `threshold`, égal à 10 pixels CSS par
  défaut. Un mouvement uniquement vertical ne doit pas le déclencher.
- Un clic relâché avant ce seuil doit rester un clic normal. Une fois le seuil franchi, le clic consécutif au geste doit
  être neutralisé afin de ne pas déclencher, par exemple, un tri.

### Réordonnancement visible

- La colonne source reste une vraie colonne : aucun clone, placeholder ou élément flottant ne suit le pointeur.
- Quand le pointeur franchit de 10 pixels la limite physique d'une colonne voisine, la source est insérée à cette
  position. Un mouvement rapide peut franchir plusieurs colonnes en une seule opération.
- Le déplacement est horizontal et continue lorsque le pointeur se trouve au-dessus, au-dessous ou en dehors de la
  table. Sa direction réelle doit être prise en compte pour éviter les allers-retours causés par un changement de
  largeur après insertion.
- Toutes les cellules de la colonne sont déplacées ensemble dans le `thead`, chaque `tbody` et le `tfoot`. Si la table
  possède un `colgroup` simple, le `<col>` correspondant est déplacé avec elles.
- Les nœuds DOM sont déplacés, et non recréés : leur identité, leurs listeners et leurs valeurs sont conservés. L'ordre
  relatif des autres colonnes ne change pas.
- Les lectures du DOM effectuées pendant le geste voient l'ordre intermédiaire réel. Aucune mutation visuelle
  supplémentaire n'est nécessaire au relâchement.

### Défilement horizontal

- Le conteneur horizontalement scrollable le plus proche est déterminé au démarrage du geste.
- Dans une zone de 50 pixels le long de ses bords, un défilement automatique continu rapproche les colonnes hors champ.
  Sa vitesse croît avec la proximité du bord, jusqu'à 800 pixels CSS par seconde.
- Le calcul de la destination doit utiliser la géométrie courante après chaque défilement, redimensionnement ou
  déplacement de colonne.
- Le défilement cesse dès que le pointeur quitte la zone, que la limite du conteneur est atteinte ou que le geste se
  termine.

### Validation et annulation

- `pointerup` valide l'ordre visible, y compris hors de la table.
- Échap, `pointercancel`, une perte inattendue de capture du pointeur ou un reset annulent le geste et replacent la
  colonne à son index initial.
- Toute fin de geste doit libérer la capture, arrêter l'animation et le défilement, puis supprimer les états visuels.
- Un seul réordonnancement peut être actif à la fois dans un même document.
- `onReorder(header)` est appelé une seule fois après une validation qui change effectivement l'index. L'en-tête reçu
  est déjà à sa position finale. La callback n'est appelée ni pour un aller-retour à l'index initial, ni après une
  annulation.

### États visuels

- Pendant le déplacement, `.column-reorder` est appliquée à chaque cellule de la colonne source et à l'élément `html`.
  Les classes des cellules constituent un hook de style applicatif ; elles ne servent pas à identifier la source.
- Le curseur doit rester horizontal sur tout le document pendant le geste, indépendamment de l'élément survolé.
- Tous ces états doivent disparaître dans chaque chemin de sortie, y compris après une interruption système.

### Colonnes protégées et intégration avec Freeze

L'option suivante contrôle les colonnes déplaçables :

```ts
isReorderable?: (header: HTMLTableCellElement) => boolean
```

Elle est évaluée sur les cellules de la ligne de prise au début de chaque geste. Une colonne refusée ne peut être ni
source, ni franchie : elle sépare la table en segments contigus indépendants.

`TableColumnReorder` ne dépend d'aucun autre plugin. `TableColumnReorderFreeze` fournit une valeur de
`isReorderable` qui protège les colonnes gelées à gauche et à droite, seulement si l'application n'a pas déjà fourni sa
propre callback. Il reste sans effet si Freeze ou Reorder n'est pas installé.

### Structure de table compatible

Le comportement garanti vise une grille horizontale simple :

| Cas | Compatibilité attendue |
| --- | --- |
| Aucune ligne de `thead`, au moins un `tbody` non vide | Oui, première ligne du premier `tbody` comme zone de prise |
| Plusieurs lignes de `thead`, plusieurs `tbody`, `tfoot` | Oui, si toutes les lignes partagent la même grille |
| Aucun `colgroup` | Oui |
| Un `colgroup` avec exactement un `<col span="1">` par colonne | Oui |
| Cellules `th` et `td` mélangées | Oui |
| Table vide | Inactive, sans erreur |

Avant d'armer le déplacement effectif, le plugin doit vérifier que chaque ligne contient le même nombre de cellules,
que chaque cellule a `colspan="1"` et `rowspan="1"`, et que l'éventuel `colgroup` respecte la structure ci-dessus. Une
table incompatible doit rester inchangée et ne provoquer aucune erreur.

### API

```ts
class TableColumnReorderOptions extends PluginOptions {
	isReorderable?: (header: HTMLTableCellElement) => boolean
	onReorder?:     (header: HTMLTableCellElement) => void
	threshold       = 10
}
```

`threshold` est exprimé en pixels CSS et doit être un nombre fini positif ou nul. La persistance de l'ordre, la mise à
jour d'un modèle ou l'envoi au serveur appartiennent à `onReorder`.

## État de l'implémentation

Le code actuel fournit déjà le parcours utilisateur principal :

- écoute déléguée sur la ligne de prise et utilisation cohérente des `PointerEvent` ;
- seuil horizontal configurable, capture du pointeur et regroupement des calculs avec `requestAnimationFrame` ;
- insertion directe et en temps réel de la cellule du même index dans toutes les lignes de `table.rows` ;
- déplacement du `<col>` correspondant lorsqu'il est trouvé ;
- pénétration de 10 pixels, mémorisation du sens et réévaluation des rectangles à chaque frame utile ;
- auto-scroll du premier ancêtre horizontalement scrollable, avec zones et vitesse conformes aux valeurs spécifiées ;
- validation au `pointerup`, restauration sur Échap, `pointercancel` et reset, et suppression du clic suivant ;
- classes `.column-reorder`, callback `onReorder`, barrières `isReorderable` et intégration avec Freeze.

L'implémentation n'a actuellement aucune suite de tests automatisés dédiée. Les garanties ci-dessus ont donc été
établies par lecture du code et de la démonstration, pas par une matrice de tests navigateur.

## Limites connues et configurations non prises en charge

### Structures de table

- **Cellules fusionnées** : `rowspan` et `colspan` ne sont pas cartographiés. Le code déplace un index DOM, qui ne
  correspond alors pas nécessairement à une colonne visuelle.
- **Grilles irrégulières** : le nombre de cellules n'est pas validé. Une ligne trop courte peut provoquer une exception
  au démarrage ou en cours de déplacement et laisser un ordre partiellement modifié.
- **`colgroup` complexes** : plusieurs `colgroup`, un nombre de `<col>` différent du nombre de cellules ou un attribut
  `span` supérieur à 1 peuvent désynchroniser les styles, déplacer le mauvais `<col>` ou provoquer une exception.
- **Colonnes masquées ou de largeur nulle** : leurs rectangles ne permettent pas de garantir un seuil de franchissement
  cohérent.
- **Mutation concurrente** : ajouter, retirer ou remplacer une ligne, une cellule, la ligne de prise ou un `<col>`
  pendant le geste n'est pas détecté. L'annulation elle-même peut alors déplacer les mauvais nœuds ou échouer.
- **DOM piloté par un framework ou table virtualisée** : seul le DOM rendu est réordonné. Un nouveau rendu peut annuler
  le choix tant que l'application n'a pas synchronisé son modèle via `onReorder`.

### Direction, saisie et accessibilité

- **RTL et modes d'écriture verticaux** : l'algorithme associe l'augmentation de `clientX` à l'augmentation de l'index
  DOM et utilise directement `scrollLeft`. Il est donc limité aux tables horizontales LTR.
- **Contrôles interactifs** : contrairement à la spécification, le code actuel n'exclut pas les liens, boutons, champs,
  contenus éditables et éléments `draggable` de la zone de prise. Un mouvement horizontal depuis l'un d'eux peut
  déplacer la colonne et neutraliser son clic.
- **Multi-touch** : le bouton principal est filtré, mais pas `event.isPrimary`. Plusieurs pointeurs ne constituent donc
  pas un scénario pris en charge de manière fiable.
- **Tactile** : aucune règle `touch-action` dédiée n'est installée. Le navigateur peut privilégier son propre scroll et
  envoyer `pointercancel` avant le démarrage du déplacement.
- **Sélection de texte** : aucune règle `user-select` dédiée n'est installée ; une sélection parasite peut donc rester
  visible après certains gestes à la souris.
- **Clavier et technologies d'assistance** : aucun mécanisme de réordonnancement au clavier, attribut ARIA ou annonce de
  la nouvelle position n'est fourni. Échap sert uniquement à annuler un geste au pointeur.

### Cycle de vie, présentation et performance

- **Perte de capture ou de fenêtre** : `lostpointercapture`, le blur de la fenêtre et le retrait de la table du document
  ne sont pas écoutés. Sans `pointerup` ou `pointercancel`, les classes et l'état global peuvent rester actifs.
- **Capture impossible** : une exception de `setPointerCapture()` n'est pas interceptée.
- **Curseur global** : la classe est posée sur `html`, mais aucune règle de curseur n'est fournie par le plugin actuel ;
  l'application doit encore définir le rendu souhaité.
- **Scroll imbriqué et viewport** : seul le premier conteneur scrollable détecté au démarrage est piloté. Le plugin ne
  passe pas à un ancêtre lorsque ce conteneur atteint sa limite et ne garantit pas l'auto-scroll de la page.
- **Largeurs hétérogènes et styles positionnels** : avec `table-layout: auto`, déplacer le contenu peut changer
  brutalement les largeurs. Les styles `:nth-child()` restent attachés aux positions ; un style métier doit être porté
  par les cellules ou par un `<col>` compatible.
- **Très grandes tables** : chaque changement d'index déplace un nœud par ligne, soit un coût linéaire. Aucun seuil de
  volumétrie ni niveau de fluidité n'est encore garanti.
- **Options invalides** : les valeurs négatives, non finies ou `NaN` de `threshold` ne sont pas normalisées.

Ces cas doivent être refusés proprement, documentés comme préconditions ou faire l'objet d'une évolution avant d'être
annoncés comme compatibles.
