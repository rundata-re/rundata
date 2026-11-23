/**
 * A page that says its own subject is not read: every wording of it in the code (web/coupures.ts, tools/coupures.ts,
 * web/eau-cyclone.ts, tools/resume.ts). Not a source named beside the subject and not read (the OVPF's Facebook page,
 * on /volcan with its data: « que nous ne lisons pas »), nor a read still to come (« pas encore lues : prochaine lecture »), nor one
 * distributor of a commune whose others are read (« Les avis de la mairie ne sont pas lus »), nor the water's question
 * on a commune's page, whose subject is the commune (web/commune-texte.ts).
 */
export const NON_LU = /(?:nous ne lisons|ne lit) pas (?:les |ses |d')avis|avis de coupure[^.]{0,80}ne sont pas (?:encore )?lus|leurs avis ne sont pas lus|avis du distributeur[^.]{0,40}ne sont pas lus/i;
