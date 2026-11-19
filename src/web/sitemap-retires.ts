/**
 * The pages left out of the sitemap from 19/11/2026, still online, linked and indexable: marketing's list of 18/11/2026,
 * made from Search Console (the pages with the fewest impressions over 95 days), so that Google spends its visits on the
 * pages people search. 842 pages stay in it. A page added after that list goes into the sitemap as before.
 */

/** FNV-1a, 32 bits, of a path's UTF-8 bytes, in hexadecimal: how the stops' pages are listed below. */
export function empreinte(path: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(path)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** The day's pages of a commune and its children's pages left out. */
const PAGES = new Set([
  "/aujourdhui/bras-panon",
  "/aujourdhui/cilaos",
  "/aujourdhui/entre-deux",
  "/aujourdhui/l-etang-sale",
  "/aujourdhui/la-plaine-des-palmistes",
  "/aujourdhui/la-possession",
  "/aujourdhui/les-avirons",
  "/aujourdhui/petite-ile",
  "/aujourdhui/saint-andre",
  "/aujourdhui/saint-benoit",
  "/aujourdhui/saint-denis",
  "/aujourdhui/saint-joseph",
  "/aujourdhui/saint-leu",
  "/aujourdhui/saint-paul",
  "/aujourdhui/saint-philippe",
  "/aujourdhui/saint-pierre",
  "/aujourdhui/sainte-rose",
  "/aujourdhui/sainte-suzanne",
  "/aujourdhui/salazie",
  "/enfants/bras-panon",
  "/enfants/cilaos",
  "/enfants/entre-deux",
  "/enfants/l-etang-sale",
  "/enfants/la-plaine-des-palmistes",
  "/enfants/la-possession",
  "/enfants/les-avirons",
  "/enfants/les-trois-bassins",
  "/enfants/petite-ile",
  "/enfants/saint-benoit",
  "/enfants/saint-philippe",
  "/enfants/sainte-marie",
  "/enfants/sainte-rose",
  "/enfants/salazie",
]);

/** 534 stops' pages (/bus/arret/…), by the print of their path: the list of their names would be 534 lines to read for nothing. */
const ARRETS = new Set([
  "0afc5610", "0e5c1f49", "287f8882", "0ff2a051", "80e10cc9", "7fa7b02c", "981e2e4a", "8b1eb86d", "26dfa451", "75603e33",
  "1f3ee2c4", "de38022f", "68fe9e8d", "022f645c", "45f237db", "1552d010", "068ab8e0", "6dd4feb3", "22be7d3f", "e856dd99",
  "ef097cf3", "c9c2d5d9", "3ea87d90", "42851c57", "be50b1bf", "a2d2f769", "687c563c", "29da3c26", "0d0575ba", "42545cb2",
  "adf964cc", "1fa07973", "6373dfae", "39e4c44d", "80665e42", "d1357398", "72a29166", "90454ef6", "9fe9a901", "dc7d1109",
  "e42f43cd", "d1c2ef0c", "4e4320d8", "68d56c2b", "fd3425a3", "1454343d", "76211d45", "0d4cf088", "19edf959", "0906ee1a",
  "917435cf", "7bb66f58", "cd4e873e", "78286825", "034a4d51", "93c3679e", "b66fa892", "60413b17", "2de83e4a", "27372be0",
  "be1c61c9", "f7ec04cb", "f4dc65b0", "884ead3a", "e3e5c7aa", "b3a44c63", "d3db704f", "e13f5642", "debe801f", "bc4a0d9b",
  "13b9420a", "bcc32adc", "886dbcd8", "b73f95cd", "120cc47d", "a2381762", "dca0996f", "f87a006f", "8bff3500", "a35f4dce",
  "871baec9", "bc395f56", "bfd68daa", "50eecc62", "7290db86", "b71776da", "3be58260", "145c2a9d", "60936d12", "d989d830",
  "2b9fb1fe", "4df9fee1", "a4f6b1af", "3946c66a", "e472dd6f", "aefe3ca3", "f84e4a45", "060c8b8a", "a41511ab", "821d604c",
  "c8281dd9", "5a95f4f5", "2c3731e4", "7d728b92", "145005f3", "677750c0", "dfdcb053", "a1e6bbf0", "99d35371", "68e1974f",
  "04e0d0ce", "f3769b63", "819e85ea", "964f0fce", "c8153e46", "bd910a13", "8da3849e", "7255a17b", "daadea43", "53eef7ef",
  "1e80c374", "6048f9bd", "65f7f7f5", "f99a051e", "b0e233d5", "f93cfde3", "d7631336", "aa473625", "46ab1fda", "41f5b90a",
  "791c7d14", "8ffe419d", "fde35f9c", "9d3dabe2", "16a60133", "8c0d0aec", "e280520c", "5d3c5e5e", "caf0e42f", "ceb0a1a7",
  "7cfc0ace", "19db7ce5", "9a790e7c", "ff7eac38", "0fc867c3", "4dd3280a", "3ab0cdc7", "3f067dc1", "dc4aaad8", "834082a8",
  "25ddc550", "4e862ba7", "2102bad9", "c0308ab2", "417cb42d", "eed662e7", "f792e2ba", "bc2cacea", "b1e804e9", "34da0a32",
  "361643b4", "2ec63ce8", "aa2c5d83", "54891829", "e99b7bf6", "d727ee01", "9bd66667", "ed04969f", "12a561e3", "b1c1eca2",
  "f67dd026", "fa086d08", "17c4a7d4", "8c7b489f", "10b28e6a", "5897c1ee", "e042930a", "0f16e675", "1134cf3e", "07f16d53",
  "eefa5400", "1c9a6eb0", "cca3ed20", "6d495b72", "c175ae57", "a1b14dad", "305c0121", "4abeee89", "47f5941a", "3757bad3",
  "a9fe2aea", "676c66ba", "a6592220", "31cd094e", "b46baffe", "9ad44ad3", "0ce841fc", "c32d44b8", "f6673d41", "a5d5c47c",
  "c2db17aa", "f98a09f0", "f73f6684", "8ba021dc", "d3873129", "a3622a0f", "cec4785d", "d02cc95a", "177ad0c9", "a35c0bdc",
  "7a5bdd07", "866df673", "438c9351", "3fcfc1c9", "712b0519", "748b9f1e", "22efad59", "4f70030e", "f6007b9a", "ad2a634b",
  "b7be7eb1", "f3a83ecf", "034cfd1b", "2b290046", "b6f5f459", "a0011a31", "d5e28118", "e0374669", "b3c9e32e", "591994b3",
  "f50e61ac", "79d58a7a", "e2847675", "9b6fb3d4", "91a3a792", "de3ae6a7", "2d6faadb", "4a5cc1e4", "1cba8994", "5cb60814",
  "fbe7ed1f", "1fbf0f0d", "fea2dd08", "a0ddbcad", "5e42ddb8", "1312cfb7", "31001db9", "689b2bf1", "f0c8ac20", "dc3501da",
  "e1a6e6f3", "6f9b290f", "3d0bf311", "84d9466d", "10b4bf5e", "d1a18b35", "22291e47", "e2782d43", "f45d8185", "86946ff1",
  "f7857791", "f4ed4b54", "60d8a1ca", "ff096855", "360b8be4", "526fb28e", "dedee21f", "1f6e1a37", "6a38f9f2", "8c1c73f5",
  "b0a3501a", "d74fe97d", "7a1fc137", "5bf5d7fc", "cfabe929", "e31072b9", "89646d77", "cf73ca03", "1ab85411", "3a07b26f",
  "247c3de4", "4e2fcb35", "985cc0ca", "6ce37f83", "5f4b67f0", "d905513b", "477d2167", "fb3c8d40", "8f2319e4", "ffa07d5e",
  "50c9de7c", "5f6010a8", "2124cea3", "c2fc6b3c", "9a2ea114", "bf220eaf", "1837fa7f", "968de4db", "7ca48692", "afb66e93",
  "6d8084fa", "ba595c2f", "bcf493fe", "c648e22d", "b522326b", "cb140260", "4853ef82", "25bf99cf", "17dd9954", "92e75551",
  "303010cd", "a26bde67", "1afb4820", "717a9f59", "b8e4c45c", "9c115409", "e9e50bdc", "83ddf896", "c706ecac", "c40e3b3d",
  "cc0cf376", "ebabd406", "832ae02b", "6170c3c1", "d684cb56", "b3808cf0", "7055746c", "af02dde9", "b1f150e7", "f5ae8638",
  "36b9b354", "1bdbe4c2", "c373a409", "7ccd91ac", "7882a45d", "b90a69a3", "0d8963de", "8fd8a2ba", "57b47ec9", "e4d17b9f",
  "fe6d8e03", "58b72fb2", "0b4cacc1", "08ce1f23", "1cc49a48", "d2e55034", "af3d4f6c", "342e6dcc", "31de727b", "942fd0e3",
  "2348cd7a", "44620b55", "6181c478", "a957ca14", "338fcc12", "28c71ad6", "4263aaec", "96a296d9", "47c5a3c4", "8d8c5fa5",
  "ae97dae0", "7e0ef547", "8060ef2a", "9f2b06e6", "489de134", "da187c7f", "cf5d1c79", "da184d5b", "d6e9d130", "5547d2bc",
  "3c146a99", "4aad2ab4", "023077ea", "0a55e281", "f7dfc96b", "024031f2", "fb06ac9b", "3c3f1544", "7c27191a", "ea41175c",
  "d9ff59a3", "ce41658c", "6a6c6cd9", "ad06d7e5", "d2e67b0c", "354a8b36", "59157397", "6d894a51", "241e334f", "1879de5a",
  "afef05d8", "1f736a4a", "e2c167d0", "70f3b0de", "ce3208c1", "554d1d9f", "0c2e2bb3", "91cac19d", "6644a73c", "42205fb3",
  "ef92b06c", "4011403b", "9d9c7192", "b0f97785", "ed163e09", "21b08c90", "0155cd94", "0a23b6d7", "94657272", "e9c0411b",
  "798d7374", "78774836", "3f2c8d90", "45ed5629", "858e5ff2", "de49b4ad", "be8985fc", "c952908d", "8839e470", "9d83effa",
  "fe6ed73e", "fae98612", "b1d9170e", "50b4f69f", "91f92935", "0b940256", "f7e4372b", "3427f47e", "68820418", "19b884e8",
  "47ad98d6", "dd00dd8b", "569421f2", "2b975121", "4a5a2577", "f9ba1498", "433eb60a", "bcf80527", "657ec49d", "4552a6b3",
  "a5ebf108", "1fef91d3", "e3bd2020", "1ded166a", "1e8c95de", "5c97c29f", "9a17c2c0", "e0d4d4dd", "6bc20388", "4a85756a",
  "28742771", "e832e364", "b6267d6f", "e8ba076d", "66054881", "fed2e55c", "f284c9fb", "e1d3691d", "6162a780", "b80bc504",
  "828a6da7", "007c81c3", "be66db64", "be2ed2bb", "c32d58bc", "0e85c6a3", "00ab76ed", "1b9703f7", "6b0146df", "dbfe3abc",
  "f4ef3211", "b53bf4ff", "955da064", "f8ce0aa5", "f836c248", "367daaff", "1773c54c", "675f380b", "7f1aaf68", "08d708c2",
  "f771e99b", "800a1bc4", "7b819df8", "e1f9287b", "1e091bbf", "0eafbed9", "2319425e", "e9f6c3d0", "1b22fa13", "823bb41f",
  "bdcb2d3d", "fa625904", "39f173f0", "da809dd2", "ed186cfc", "06e346b1", "9646b32d", "b291c88b", "be4eb276", "3992bdf2",
  "7b648e58", "9021b362", "8458d969", "f6158d45", "20b2f0ff", "549856a1", "b3f5a886", "ddfc75a5", "d67c0e2d", "45938170",
  "5fbbf137", "5a8acf57", "08e986df", "145a257c", "a1128a8a", "f691bfcd", "15edd66c", "beb7c3ad", "d888e106", "1f48090e",
  "d18fb6c4", "005ea7e9", "bdad6923", "ff337f24", "99518d4f", "a5345337", "c51d8464", "3f66eed6", "a2c2f8a4", "836784bc",
  "d4b3a287", "6fb9256b", "34a1f5ac", "4ecd6ee9",
]);

/** Whether a page of the site is one left out of the sitemap from 19/11/2026 (marketing's list of 18/11/2026). */
export const retiree = (path: string) => PAGES.has(path) || (path.startsWith("/bus/arret/") && ARRETS.has(empreinte(path)));
