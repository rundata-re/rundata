# Nouveautés à venir

Une pull request qui apporte un changement visible écrit sa ligne de nouveautés ici, dans un fichier à elle : `nouveautes-a-venir/<nom-de-la-branche>.txt`, une ligne par changement, 140 caractères au plus, en mots simples. Pour une branche nommée `prefixe/sujet`, le fichier prend la dernière partie seule (`sujet.txt`) : les sous-dossiers ne sont pas lus. Les espaces ordinaires suffisent : toutes les espaces insécables du site sont mises au rangement, avant « : ; ? ! », dans les guillemets, entre un chiffre et son unité (« 2 h », « 39 % »), après « à » devant un chiffre et entre les milliers.

À la fusion, `scripts/ranger-nouveautes.ts` place ces lignes en tête de la liste de `src/nouveautes.ts`, datées de l'heure de la fusion, supprime leurs fichiers, puis `npm run changelog` réécrit CHANGELOG.md. Deux pull requests ouvertes ne touchent ainsi jamais les mêmes lignes, et l'une ne met plus l'autre en conflit en fusionnant.

`test/nouveautes-a-venir.test.ts` vérifie chaque ligne en attente avec les règles de la liste.
