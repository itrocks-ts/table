# Réordonnancement des colonnes

## Objet du document

Ce document fait l'état des lieux du prototype `TableColumnReorder`, critique son approche et spécifie une interaction
de réordonnancement en temps réel avant toute reprise du code.

Il ne constitue pas encore une décision d'implémentation. Les derniers choix à valider sont regroupés à la fin.

## Synthèse

Le plugin n'est pas fonctionnel à ce jour. Il sait repérer les cellules de la première ligne et contient l'ébauche
d'une détection de geste, mais il ne déplace rien et ne gère ni destination, ni drop, ni annulation.

L'interaction retenue est désormais beaucoup plus simple :

1. une pression sur un titre arme le drag ;
2. le drag commence après un déplacement horizontal configurable, de 10 px par défaut ;
3. dès que le pointeur pénètre dans une autre colonne, la colonne source est réellement déplacée à cet endroit ;
4. toutes les cellules intermédiaires prennent immédiatement leur position finale ;
5. au `pointerup`, l'ordre visible est simplement validé ;
6. sur Échap ou annulation système, la colonne revient à son index initial.

Il n'y a plus besoin de colonne flottante, de placeholder, de pseudo-colonne, de flèche ou de renderer séparé. Le DOM
du tableau constitue directement l'aperçu final.

Une classe `.column-reorder` est ajoutée à toutes les cellules de la colonne déplacée. Elle sert uniquement de hook
visuel pour l'application : le fonctionnement du plugin ne doit pas dépendre de son style.

Aucun élément ne suit la souris. Dès le seuil franchi, le plugin impose seulement un curseur de drag prioritaire sur
tout le document, jusqu'au relâchement du bouton.

La logique d'interaction peut rester compacte avec :

- un unique listener délégué sur la table ;
- des `PointerEvent` de bout en bout ;
- trois états explicites : repos, pression en attente et déplacement ;
- une capture du pointeur ;
- un seuil de démarrage de 10 px ;
- un déplacement DOM seulement lorsque l'index survolé change.

## État actuel

### Ce qui existe

`TableColumnReorder` :

- est bien un plugin de `Table` ;
- cherche les enfants directs de la première ligne du `thead` ;
- utilise la première ligne du `tbody` en repli ;
- installe un `pointerdown` sur chaque cellule trouvée ;
- écoute ensuite les mouvements et relâchements au niveau du document ;
- distingue sommairement une pression d'un drag au moyen d'un seuil codé en dur à 10.

L'historique montre qu'il s'agit pratiquement du prototype initial. Les changements ultérieurs ont seulement suivi
les évolutions communes du dépôt : exports nommés, chemin d'import, cycle `init()` et remplacement de `mousedown` par
`pointerdown`.

### Ce qui manque

Il n'existe encore aucune implémentation de :

- calcul fiable de la colonne source ;
- calcul de la colonne survolée ;
- déplacement coordonné de la même colonne dans toutes les lignes ;
- prise en compte des `<colgroup>` et `<col>` existants ;
- classe visuelle de drag ;
- restauration de l'ordre initial après annulation ;
- notification de l'ordre validé ;
- option de configuration ;
- interaction au clavier ;
- test automatique ou scénario de démonstration dédié.

Le fichier de déclaration ne décrit logiquement que le prototype actuel. Il ne faut pas le modifier à la main : il
devra être régénéré par le build lorsque le TypeScript aura été validé.

## Critique du prototype

### Détection du geste incorrecte

La position mémorisée lors de `pointerdown` n'est pas celle de l'événement. Elle est recopiée depuis le dernier
`mousemove`, ou depuis `(0, 0)` si aucun mouvement n'a encore eu lieu.

La distance actuelle est calculée comme :

```text
sqrt(abs(dx) * abs(dy))
```

Ce calcul vaut zéro lors d'un mouvement strictement horizontal ou vertical. Il est donc particulièrement inadapté à
un réordonnancement de colonnes. Le bon critère est simplement `abs(dx)` : le déplacement vertical n'a aucun rôle dans
ce geste.

### Mélange de familles d'événements

Le geste commence avec `pointerdown`, mais continue avec `mousemove` et `mouseup`. Le bénéfice de Pointer Events est
alors perdu pour le tactile, le stylet, `pointercancel`, l'identification du pointeur actif et sa capture.

Le geste doit utiliser exclusivement `pointerdown`, `pointermove`, `pointerup`, `pointercancel` et
`lostpointercapture`.

### Mauvaise identification de la cellule

`event.target` peut être un élément placé dans le titre, par exemple un lien, un bouton ou un `input`. Le convertir
par assertion en `HTMLTableCellElement` ne le transforme pas en cellule.

La cellule doit venir du listener délégué avec `closest('th, td')`, puis être validée comme enfant direct de la ligne
de titre de cette table. Les descendants interactifs doivent être ignorés par défaut afin qu'une case à cocher, un
bouton de tri ou un lien restent utilisables.

### Trop de listeners

Un listener par cellule est inutile. Un seul `pointerdown` sur la table suffit et fonctionne aussi si la première
ligne est remplacée. Le `NodeList` actuel est statique et devient obsolète après une modification dynamique du titre.

### Pas de cycle de vie du drag

Le prototype ne filtre ni le bouton principal, ni le pointeur principal. Il ne capture pas le pointeur et ne traite
pas sa perte, la touche Échap, un reset de table ou un second pointeur.

Une fin de drag doit toujours emprunter une routine unique qui enlève les classes, libère la capture et valide ou
restaure l'ordre.

### Types trompeurs

Les cellules de déclenchement sont typées avec `HTMLTableFreezeElement`, union d'une cellule et d'un `<col>`, alors
que les sélecteurs retournent uniquement des cellules. Les génériques `querySelectorAll<HTMLTableColElement>` sont
également incohérents avec les sélecteurs.

L'import de ce type doit disparaître : le plugin manipule directement des `HTMLTableCellElement` et ne dépend d'aucun
autre plugin.

### Interaction non définie avec les autres plugins

La présentation et le positionnement des titres ou des colonnes appartiennent aux plugins concernés.
`TableColumnReorder` ne doit ni les détecter, ni les calculer, ni les corriger. Son unique extension point est la
callback `isReorderable`, quelle que soit l'origine de la fonction fournie dans ses options.

Le plugin Edit peut contenir une cellule active. Un drag ne doit pas commencer depuis un contrôle interactif ou une
zone d'édition. Le comportement d'une édition active lors d'un déplacement doit être défini.

## Interaction retenue

### Principe

La colonne source n'est pas rendue dans une surcouche et ne suit pas le pointeur par transformation. Elle reste une
vraie colonne du tableau.

Quand le pointeur quitte sa position courante vers une colonne voisine, le plugin déplace immédiatement la cellule
source au même nouvel index dans chaque ligne. La ligne de titre, le corps, le pied et les éventuels `<col>` restent
ainsi synchronisés.

Le tableau affiché pendant le drag est toujours un ordre réellement présent dans le DOM. Le `pointerup` n'a aucune
mutation visuelle à effectuer.

### Conséquence sur la contrainte DOM

L'ancienne contrainte « aucune mutation structurelle avant le drop » est abandonnée. À partir du franchissement du
seuil, le plugin déplace effectivement les cellules à chaque changement de colonne survolée.

En contrepartie :

- aucun nœud temporaire n'est créé ;
- aucun contenu n'est cloné ;
- aucune cellule factice n'est ajoutée ;
- aucun pseudo-élément n'est nécessaire au fonctionnement ;
- l'identité des cellules et de leurs descendants est conservée ;
- l'ordre courant du DOM correspond exactement à l'ordre visible.

### Échange adjacent et insertion directe

Quand le pointeur passe dans la colonne immédiatement voisine, déplacer la source avant ou après cette voisine
revient à échanger les deux colonnes.

Si un mouvement rapide saute plusieurs colonnes, il est inutile d'exécuter plusieurs mutations successives dans la
même frame. Une insertion directe à l'index survolé donne le même ordre final que la succession d'échanges adjacents :
les colonnes intermédiaires se décalent d'une position.

Cette insertion directe est recommandée pour limiter les reflows.

## Spécification fonctionnelle proposée

### Zone de déclenchement

Les cellules directes de la première ligne du `thead` déclenchent le geste. Si aucun `thead` n'existe, le plugin prend
la première ligne du premier `tbody`. Une table sans aucune de ces deux lignes n'active pas le réordonnancement.

Aucune classe ni aucun attribut ne sont requis sur ces cellules avant l'activation.

Un drag ne commence pas depuis un descendant interactif : `a`, `button`, `input`, `select`, `textarea`, élément
éditable ou élément explicitement draggable.

Seuls le pointeur principal et le bouton principal sont acceptés.

### États

Le moteur comporte exactement trois états :

1. `idle` : aucun geste ;
2. `armed` : bouton pressé, seuil pas encore franchi ;
3. `dragging` : l'ordre du DOM est mis à jour selon l'index horizontal survolé.

Avant le franchissement du seuil, relâcher le bouton conserve le comportement normal d'un clic.

### Seuil de démarrage

Le seuil est une option, exprimée en pixels CSS, valant 10 par défaut.

Le drag commence lorsque `abs(clientX - startX)` atteint ce seuil. `clientY` n'est ni mémorisé, ni lu. Un mouvement
purement vertical ne déclenche donc jamais le réordonnancement.

Le seuil est mesuré depuis la coordonnée X du `pointerdown`, jamais depuis le dernier mouvement.

### Capture du pointeur

La cellule ou la table capture le `pointerId` dès que le drag commence. Les événements continuent ainsi d'arriver si
le pointeur passe sur un descendant ou quitte la table. Le drag reste actif jusqu'au relâchement du bouton.

La capture signifie que `event.target` ne peut pas servir à connaître la colonne survolée. Celle-ci doit être déduite
de `clientX` et des rectangles des cellules de titre.

### Détermination de la colonne survolée

Le réordonnancement est exclusivement horizontal. La coordonnée Y n'est jamais consultée et la colonne reste
déplaçable si le pointeur passe dans le corps, au-dessus, au-dessous ou en dehors de la table.

À chaque frame utile, le plugin compare `clientX` aux rectangles des titres et détermine l'index horizontal visé. Les
rectangles doivent être recalculés après une mutation, un scroll ou un resize, car le layout peut avoir changé.

Il ne faut ni utiliser `pageX` avec des rectangles viewport, ni lancer une recherche DOM complète à chaque pixel.

À gauche du premier rectangle, l'index visé est le premier. À droite du dernier, il est le dernier. Le drag reste
ainsi opérationnel lorsque le pointeur sort horizontalement de la table.

### Moment du déplacement

Un déplacement DOM a lieu uniquement lorsque l'index visé diffère de l'index courant de la source.

Le sens du dernier mouvement réel du pointeur doit être pris en compte :

- un mouvement vers la droite ne peut déplacer la source que vers la droite ;
- un mouvement vers la gauche ne peut la déplacer que vers la gauche ;
- un changement de layout sans mouvement du pointeur ne déclenche jamais un échange inverse.

Cette règle empêche un ping-pong automatique lorsque deux colonnes ont des largeurs différentes.

Un léger seuil de pénétration dans la colonne voisine complète la règle directionnelle. Il est exprimé en pixels CSS,
indépendamment de la largeur de la voisine, et placé dans une constante au début du module :

```ts
const penetration = 10
```

La valeur initiale de 10 px devra être validée dans la démonstration. Ce n'est pas une option publique et ce seuil est
distinct des 10 px qui démarrent le drag.

La pénétration se mesure depuis la frontière physique franchie, et non comme une obligation de rester à l'intérieur
de la cellule voisine. Une colonne large de moins de 10 px reste ainsi franchissable : le déplacement intervient dès
que le pointeur se trouve 10 px au-delà de sa frontière, éventuellement au-dessus de la colonne suivante.

### Largeurs de colonnes et stabilité visuelle

Avec des largeurs attachées aux positions, entrer dans la colonne voisine puis échanger les deux place naturellement
la source sous le pointeur.

Avec `table-layout: auto`, des largeurs peuvent suivre les contenus. Une source étroite déplacée après une voisine très
large peut alors apparaître plus loin que le pointeur. Inversement, les largeurs déclarées par `:nth-child()` restent
attachées aux positions et non aux colonnes métier.

Il ne faut pas complexifier la première version pour masquer tous ces effets. La spécification doit toutefois tester
des largeurs très différentes. Si le saut est gênant dans les tables réelles, les choix possibles seront :

- déclencher le changement plus profondément dans la voisine ;
- figer temporairement les largeurs des positions pendant le drag ;
- documenter que les largeurs appartiennent aux positions ;
- accepter et documenter ce comportement si les tables concernées restent utilisables.

Le premier choix, accompagné de la règle directionnelle, est recommandé.

### Classe `.column-reorder`

Le plugin conserve la source par référence d'élément et par index courant. Il ne doit jamais utiliser la classe
`.column-reorder` comme état interne.

Pour permettre à l'application de mettre la colonne en évidence, `.column-reorder` est ajoutée à chaque cellule de la
colonne logique, dans toutes les sections de la table. Les classes se déplacent naturellement avec les cellules.

Une classe placée uniquement sur le titre ne permettrait de styliser que le titre. Une classe placée sur un `<col>` ne
se propage pas aux cellules correspondantes.

Le plugin ajoute systématiquement `.column-reorder`, sans lui associer de style de cellule par défaut. Le hook reste
alors stable et totalement facultatif côté application.

La même classe étant aussi portée par `<html>`, les styles applicatifs destinés à la colonne doivent qualifier leurs
sélecteurs, par exemple avec `td.column-reorder, th.column-reorder`, plutôt que cibler `.column-reorder` seule.

### Curseur global pendant le drag

Le curseur ne doit pas dépendre de l'élément actuellement survolé. Au démarrage effectif du drag, le plugin ajoute un
état global dédié sur `document.documentElement` et active une règle équivalente à :

```css
html.column-reorder,
html.column-reorder * {
	cursor: ew-resize !important;
}
```

La règle appartient au plugin, pas à la feuille de style de l'application. Sa priorité garantit qu'un lien, un champ,
une cellule éditable ou un élément extérieur à la table ne remplace pas le curseur pendant le geste.

`ew-resize` est retenu parce qu'il fournit nativement les deux flèches horizontales dans les navigateurs, sans image
de curseur spécifique. Même si son nom CSS parle de redimensionnement, son apparence exprime clairement le mouvement
horizontal attendu ici.

L'état global commence seulement après le seuil de 10 px. Il doit être supprimé dans tous les chemins de sortie :
`pointerup`, Échap, `pointercancel`, perte de capture, reset et destruction du plugin.

Comme `.column-reorder` sur `<html>` est un état partagé par toutes les tables, un seul réordonnancement de colonne
peut être actif à la fois dans un document. L'instance qui pose la classe en est propriétaire et elle seule peut la
retirer ; une seconde tentative de drag est ignorée jusqu'au nettoyage de la première.

Cette règle ne peut évidemment contrôler le curseur lorsqu'il se trouve hors de la fenêtre du navigateur. La capture
et les événements d'annulation restent nécessaires pour éviter qu'un état global ne subsiste après une interruption.

### Déplacement coordonné de la colonne

À chaque changement d'index, il faut déplacer la cellule source correspondante dans :

- chaque ligne du `thead` ;
- chaque ligne de chaque `tbody` ;
- chaque ligne du `tfoot` ;
- le `colgroup`, lorsqu'il contient un `<col>` simple par colonne.

Les nœuds eux-mêmes sont déplacés avec `insertBefore()` ou `before()` / `after()`. Leur contenu, leurs listeners,
leurs valeurs de formulaire et leur identité sont ainsi conservés.

L'ordre relatif de toutes les colonnes autres que la source reste inchangé. Cela permet de restaurer l'ordre initial
en remettant seulement la source à son index de départ.

### Rôle des `<col>`

Le plugin ne doit toujours pas créer de `<col>` pour faciliter le drag.

Quand un `colgroup` simple existe déjà, son `<col>` source doit être déplacé en même temps que les cellules. Sinon le
rendu pendant le drag ne serait pas le rendu final : largeurs, fonds ou autres propriétés resteraient attachés à
l'ancien index jusqu'au drop.

Un `<col>` n'est pas le parent DOM des cellules de sa colonne. Sa classe ne permet donc pas de piloter tout le rendu de
la colonne déplacée.

### Drop

Au `pointerup`, l'ordre courant est déjà le bon. Le plugin doit seulement :

- mémoriser l'index final ;
- marquer le geste comme validé ;
- retirer `.column-reorder` de l'élément racine et des cellules ;
- libérer la capture ;
- supprimer l'état interne ;
- appeler `onReorder` si l'index final diffère de l'index initial.

Aucune seconde mutation de cellules et aucun recalcul visuel spécifique au drop ne sont nécessaires.

Un `pointerup` après franchissement du seuil ne doit pas produire le clic du titre, lancer un tri ou activer un
contrôle.

Le `pointerup` valide l'ordre courant même si le pointeur se trouve hors de la table. Quitter la table n'est pas une
annulation et ne suspend pas le geste.

La perte de capture provoquée normalement par `pointerup` ou par la libération explicite ne doit pas restaurer
l'ancien ordre. Seule une perte de capture inattendue alors que le geste est encore actif constitue une annulation.

### Annulation

Échap, `pointercancel`, une perte inattendue de capture, un reset ou la disparition de la ligne de titre annulent le
geste.

Contrairement au drop, une annulation doit remettre la source à son index initial dans toutes les lignes et dans le
`colgroup`. Ce retour est la seule mutation supplémentaire nécessaire.

Si la table a été modifiée par un autre acteur pendant le drag, le plugin doit annuler prudemment et ne pas déplacer
des cellules dont la correspondance n'est plus certaine.

### Callback après validation

Une option de plugin reçoit la callback appelée après un drop ayant effectivement changé l'index :

```ts
onReorder: (header: HTMLTableCellElement) => void
```

Le seul argument est l'élément d'en-tête qui a servi au drag. Au moment de l'appel, il est déjà placé à son nouvel
index et toutes les lignes sont déjà réordonnées. La callback peut donc lire le DOM final et effectuer librement la
persistance ou les traitements propres à l'application.

La callback n'est appelée ni pendant les déplacements intermédiaires, ni après un drop sans changement, ni après une
annulation. Aucun `CustomEvent` supplémentaire n'est prévu.

La responsabilité du plugin s'arrête au nouvel ordre du DOM et à cet appel. Il ne sérialise pas l'ordre, ne le
persiste pas et ne met à jour aucun modèle applicatif. L'application réalise ces opérations dans `onReorder` si elle
en a besoin.

### Portée structurelle initiale

Une première version fiable doit accepter uniquement une grille rectangulaire :

- même nombre de cellules logiques dans chaque ligne ;
- absence de `rowspan` et `colspan` traversant les colonnes déplaçables ;
- au plus un `<col>` simple par colonne ;
- plusieurs `tbody` permis seulement s'ils ont la même grille.

Déplacer une colonne logique à travers des cellules fusionnées nécessite une cartographie de grille distincte et ne
doit pas être simulé avec `nth-child()`.

### Colonnes non déplaçables

Une option décide si une colonne peut être déplacée à partir de son élément d'en-tête :

```ts
isReorderable?: (header: HTMLTableCellElement) => boolean
```

Sa valeur par défaut autorise toutes les colonnes. La callback est réévaluée au début de chaque drag, afin que la
décision reflète la configuration et l'état courants de la table.

Une colonne refusée ne peut pas servir de source. Elle forme aussi une barrière infranchissable : une source autorisée
ne peut pas passer de l'autre côté, car cela décalerait malgré tout l'index de la colonne protégée.

Le plugin évalue la callback sur tous les en-têtes au début du geste. La source reste confinée dans le segment contigu
de colonnes autorisées qui la contient :

- un préfixe de colonnes refusées ne peut pas être dépassé vers la gauche ;
- un suffixe de colonnes refusées ne peut pas être dépassé vers la droite ;
- une colonne refusée au milieu de la table sépare deux segments indépendants.

Un mouvement rapide qui vise directement une colonne située au-delà d'une barrière est borné à la dernière position
autorisée du segment courant. L'optimisation par insertion directe ne doit donc jamais sauter une colonne refusée.

Cette règle est entièrement générique. `TableColumnReorder` ne connaît que le résultat booléen de la callback et
n'importe aucun autre plugin.

### Plugin d'intégration `column-reorder-freeze`

La coopération avec Freeze appartient à un plugin distinct, `column-reorder-freeze`. Lui seul connaît Freeze et
`TableColumnReorder`.

Ce plugin propose une implémentation de `isReorderable` fondée sur les colonnes gelées et l'injecte dans les options de
`TableColumnReorder` uniquement si leur valeur est encore `undefined`. Le plugin de base interprète lui-même
`undefined` comme « toutes les colonnes sont autorisées ». Une callback explicitement fournie par l'application reste
ainsi prioritaire sans comparaison fragile entre fonctions.

L'injection peut avoir lieu pendant l'initialisation du plugin d'intégration : `isReorderable` n'est évaluée qu'au
début d'un drag. Le plugin d'intégration doit rester sans effet si l'une de ses deux dépendances n'est pas assemblée.

Toute évolution de la détection des colonnes gelées reste ainsi confinée à `column-reorder-freeze` et ne modifie ni
l'API, ni l'algorithme de `column-reorder`.

### Performance

Le réordonnancement live est plus simple graphiquement, mais chaque changement de colonne déplace un nœud dans chaque
ligne et provoque un layout.

Pendant `pointermove` :

- regrouper le traitement dans `requestAnimationFrame` ;
- ignorer les événements du pointeur actif qui ne changent pas la coordonnée utile ;
- ne lire la géométrie qu'avant les écritures de la frame ;
- ne muter le DOM que lorsque l'index visé change ;
- faire une insertion directe si plusieurs colonnes ont été franchies ;
- recalculer la géométrie une seule fois après l'insertion ;
- ne pas appeler `onReorder` pendant le geste.

Une table de nombreuses lignes doit être testée explicitement. Le coût est en O(nombre de lignes) par changement
d'index, et non plus seulement au drop, mais les changements d'index sont beaucoup moins fréquents que les
`pointermove`.

### Scroll horizontal

Au démarrage du drag, le plugin cherche le plus proche élément horizontalement scrollable en partant de la table
elle-même, puis en remontant ses ancêtres. Un élément est éligible si son overflow horizontal autorise le scroll et si
`scrollWidth` est supérieur à `clientWidth`.

Cette recherche appartient directement à Reorder et ne dépend d'aucun autre plugin.

La largeur des zones latérales est placée dans une constante au début du module :

```ts
const maxScrollSpeed = 800
const scrollZone     = 50
```

La valeur initiale de 50 px devra être validée dans la démonstration. Dans les `scrollZone` pixels qui longent le bord
gauche ou droit du conteneur, le plugin déclenche un scroll dans la direction correspondante.

La vitesse dépend linéairement de la proximité du bord :

```text
proximity = 1 - clamp(distanceToEdge / scrollZone, 0, 1)
speed = maxScrollSpeed * proximity
```

À `scrollZone - 1` pixels du bord, le scroll est donc très lent. Au bord, ou au-delà du conteneur, il atteint sa
vitesse maximale, initialement fixée à 800 pixels CSS par seconde par `maxScrollSpeed`. Le déplacement effectif tient
compte du temps écoulé entre deux frames afin de ne pas dépendre du taux de rafraîchissement de l'écran.

L'auto-scroll fonctionne dans une boucle `requestAnimationFrame` tant que le pointeur reste dans une zone latérale,
même si aucun nouveau `pointermove` n'arrive. Il s'arrête immédiatement si :

- le pointeur quitte la zone latérale ;
- la limite de scroll est atteinte ;
- le drag est validé ou annulé ;
- la capture du pointeur est perdue.

Une barrière `isReorderable` borne la position de la colonne, mais pas le scroll du conteneur. Le pointeur maintenu
au bord peut donc continuer à faire défiler la table jusqu'à sa limite physique, notamment lorsque des colonnes fixes
occupent ses extrémités.

Après chaque pas d'auto-scroll, les rectangles des titres et l'index visé sont recalculés. Le réordonnancement live
continue donc pendant le défilement et la colonne peut traverser les colonnes nouvellement affichées.

### Accessibilité et clavier

Le support clavier et les annonces accessibles sont explicitement hors périmètre. Le plugin n'ajoute donc ni gestion
de focus, ni raccourci clavier de réordonnancement, ni zone live.

Échap reste géré pendant un drag commencé au pointeur, car il s'agit d'une commande d'annulation et non d'un mode de
réordonnancement au clavier.

## Critique de l'interaction retenue

### Points forts

- Le rendu intermédiaire est le rendu final réel.
- Le drop ne provoque aucun saut ni changement tardif.
- Aucun clone, placeholder ou pseudo-élément n'est nécessaire.
- Le code de rendu disparaît presque entièrement.
- Les cellules conservent leur identité et leurs états internes.
- Le modèle est immédiatement compréhensible : les colonnes s'écartent et la source prend leur place.

### Ordre DOM pendant le geste

Le DOM n'est plus stable pendant le drag : tout code qui lit la table voit son ordre visuel courant. C'est le
comportement attendu du rendu live. `onReorder` reste le seul signal indiquant que l'utilisateur a validé cet ordre.

### Annulation plus coûteuse que le drop

Le drop est trivial, mais l'annulation doit effectuer une dernière mutation pour restaurer l'ordre initial. Ce coût
est faible puisque seule la source a changé de position et que l'ordre relatif des autres colonnes est conservé.

### Risque de jitter avec des largeurs hétérogènes

Le déplacement du DOM peut changer immédiatement les rectangles utilisés pour décider le déplacement suivant. Sans
direction mémorisée ni hystérésis, le plugin pourrait échanger deux colonnes puis les remettre dans la frame suivante.

Ce n'est pas une raison pour abandonner le modèle, mais la règle directionnelle fait partie de sa correction, pas
d'un raffinement optionnel.

### Coût sur les grandes tables

Déplacer une cellule dans chaque ligne peut être perceptible sur des milliers de lignes. Le modèle reste viable si la
mutation n'a lieu qu'au franchissement d'une colonne. Une insertion directe est préférable à une boucle de swaps lors
d'un mouvement rapide.

### Styles dépendant de l'index

Les sélecteurs `:nth-child()` et les largeurs attachées aux indices s'appliquent immédiatement à de nouveaux contenus.
C'est cohérent si ces styles décrivent des positions, mais pas nécessairement s'ils décrivent des colonnes métier.

Les styles qui doivent suivre une colonne métier doivent être portés par ses cellules ou par un `<col>` déplacé avec
elle. Reorder ne transforme ni ne recalcule les autres styles de présentation.

## Recommandation d'architecture

Une abstraction générique de drag-and-drop n'est pas nécessaire. Le plugin peut rester organisé autour de quelques
opérations privées testables :

1. trouver le titre source ;
2. armer le geste ;
3. démarrer après le seuil ;
4. trouver l'index horizontal visé ;
5. déplacer la colonne de l'index courant vers cet index ;
6. valider ou restaurer l'ordre ;
7. appeler la callback après validation ;
8. piloter et arrêter l'auto-scroll ;
9. nettoyer la capture et les classes.

L'état minimal contient :

- le `pointerId` ;
- la coordonnée X de départ et la dernière coordonnée X ;
- les références des cellules qui forment la colonne source ;
- l'index initial ;
- l'index courant ;
- les limites autorisées, déduites de `isReorderable` ;
- le conteneur horizontalement scrollable et l'horodatage de la dernière frame ;
- le statut `armed` ou `dragging`.

La même primitive `moveColumn(from, to)` doit servir au pointeur et à la restauration après annulation.

## Scénarios de validation futurs

La future implémentation devra au minimum vérifier :

- clic sans franchir le seuil ;
- mouvement strictement horizontal et absence de déclenchement sur un mouvement strictement vertical ;
- seuil exactement inférieur, égal et supérieur à 10 px ;
- échange d'une position vers la gauche et vers la droite ;
- saut direct de plusieurs colonnes ;
- inversion immédiate du sens du pointeur ;
- absence de ping-pong à coordonnée X constante ;
- pénétration de la voisine juste avant, au niveau et juste après la constante ;
- franchissement d'une colonne plus étroite que `penetration` ;
- colonnes source et voisine de largeurs très différentes ;
- drop sans déplacement effectif ;
- ordre déjà final au moment du drop ;
- appel unique de `onReorder` avec l'en-tête à son index final ;
- absence d'appel après un drop sans changement ou une annulation ;
- restauration sur Échap, `pointercancel` et perte de capture ;
- absence de restauration lors du `lostpointercapture` normal qui suit un drop ;
- maintien du drag hors de la table et validation au relâchement ;
- curseur global prioritaire, puis nettoyage sur chaque sortie possible ;
- refus d'un second drag tant que la classe globale appartient au premier ;
- contrôle interactif dans un titre ;
- première ligne du premier `tbody` en l'absence de `thead` ;
- absence d'auto-scroll hors des zones latérales ;
- vitesse croissante entre `scrollZone - 1` et le bord ;
- vitesse maximale lorsque le pointeur dépasse le bord ;
- auto-scroll continu sans nouveau `pointermove` ;
- arrêt à la limite du scroll, au drop et à l'annulation ;
- poursuite de l'auto-scroll jusqu'à la limite physique après la barrière du segment autorisé ;
- réordonnancement vers les colonnes révélées par l'auto-scroll ;
- auto-scroll lorsque la table elle-même est le plus proche élément horizontalement scrollable ;
- scroll manuel pendant le drag ;
- table dans une page déjà scrollée ;
- colonne refusée comme source et comme barrière infranchissable ;
- préfixe et suffixe de colonnes refusées ;
- colonne refusée séparant deux segments autorisés ;
- injection par `column-reorder-freeze` seulement en l'absence d'une callback applicative ;
- conservation d'une callback applicative explicite par `column-reorder-freeze` ;
- absence d'effet de `column-reorder-freeze` si l'une de ses dépendances manque ;
- plusieurs tables sur la même page ;
- reset pendant ou après un drag ;
- lignes de `thead`, `tbody` et `tfoot` ;
- `<colgroup>` existant ;
- conservation des listeners, valeurs de formulaire et éléments focalisés ;
- direction RTL ;
- zoom navigateur et échelle d'affichage ;
- table vide et table à une seule colonne ;
- rejet documenté des cellules fusionnées ;
- performance sur une table de nombreuses lignes.

## Décisions arrêtées

1. La première ligne du `thead` sert de barre de drag. Sans `thead`, la première ligne du premier `tbody` la remplace.
2. Le déplacement exige une pénétration légère dans la colonne voisine. Sa distance est définie dans la constante de
   module `penetration`, initialement à 10 px et indépendante de la largeur de la voisine.
3. L'option `isReorderable(header)` décide si une colonne est déplaçable. Toute colonne refusée est aussi une barrière,
   et la source reste dans son segment contigu de colonnes autorisées.
4. `TableColumnReorder` ne connaît aucun autre plugin. `column-reorder-freeze` injecte séparément son implémentation de
   `isReorderable` comme valeur par défaut, sans remplacer une callback applicative explicite.
5. Le curseur global est `ew-resize`, afin d'afficher deux flèches horizontales avec le curseur natif du navigateur.
6. Le support clavier et les annonces accessibles ne font pas partie du plugin.
7. Après un changement validé, `onReorder(header)` reçoit uniquement l'en-tête déplacé, déjà à son nouvel index.
8. Le plugin modifie seulement le DOM. Toute synchronisation supplémentaire appartient à `onReorder`.
9. Le plus proche conteneur horizontalement scrollable défile près de ses bords. La zone mesure `scrollZone` pixels et
   la vitesse augmente avec la proximité du bord.

## Orientation recommandée

Pour une première version compacte, stable et personnalisable :

- aucun nœud temporaire et aucun `<col>` ajouté ;
- aucun prérequis de classe ou d'attribut dans le HTML applicatif ;
- Pointer Events délégués et seuil de démarrage de 10 px ;
- déplacement horizontal en temps réel par insertion DOM ;
- mutation seulement lorsque l'index visé change ;
- insertion directe en cas de saut de plusieurs colonnes ;
- sens du pointeur mémorisé et pénétration de 10 px définie par une constante de module ;
- `.column-reorder` sur `<html>` et toutes les cellules de la source ;
- aucun élément suivant la souris ;
- curseur `ew-resize` imposé avec priorité sur tout le document ;
- drag maintenu hors de la table et ordre courant validé au relâchement ;
- `pointerup` limité à la validation et au nettoyage ;
- retour à l'index initial sur Échap ou annulation système ;
- grille rectangulaire sans cellules fusionnées ;
- `isReorderable(header)` comme unique contrat des colonnes protégées et des frontières de déplacement ;
- aucune connaissance d'un autre plugin dans `column-reorder` ;
- injection par le plugin séparé `column-reorder-freeze`, sans écraser une callback explicite ;
- auto-scroll du plus proche conteneur horizontal, avec zone et vitesse maximale définies par des constantes ;
- un seul appel à `onReorder(header)` après un drop ayant changé l'ordre ;
- aucune persistance ou synchronisation de modèle dans le plugin ;
- aucun support clavier ni annonce accessible.

Ce modèle est nettement plus simple que les pseudo-colonnes. Sa seule vraie complexité ne concerne plus le rendu,
mais la robustesse de la mutation live : géométrie après reflow, largeurs hétérogènes, annulation et coopération avec
les plugins qui dépendent de `:nth-child()`.

## Références techniques

- [Pointer Events, notamment la capture du pointeur](https://www.w3.org/TR/pointerevents3/)
- [CSS 2.1 : modèle des tables](https://www.w3.org/TR/CSS21/tables.html)
