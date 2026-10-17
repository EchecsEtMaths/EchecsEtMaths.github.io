        const CLIENT_ID = '295337092689-8ojd0pej3bp2d6gg3hn62mnm2922bb38.apps.googleusercontent.com';
        const API_KEY = 'AIzaSyCF5pFnQbWh3DK8XMX5feIVZOsgLUWkBM8';

        const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
        const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

        const SPREADSHEET_ID = '1CPUgPGTz6O5-koRApti8A2r9w8VAVBWnAd0LZC_lUEE';
        const ONGLET = '2026';
        const RANGE = `'${ONGLET}'!A1:Y34`;

        // Nouvelle clé : ignore l'ancien jeton (lecture seule) resté dans le localStorage
        const CLE_TOKEN = 'gtoken_rw';
        localStorage.removeItem('gtoken');

        const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet',
            'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const NB_COLS = 25; // A..Y
        const MOIS_COURANT = new Date().getMonth(); // 0 = janvier
        const ANNEE = new Date().getFullYear();

        const fmtEuro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

        const dashboardEl = document.getElementById('dashboard');
        const contentEl = document.getElementById('content');
        const authBtn = document.getElementById('authorize_button');
        const signoutBtn = document.getElementById('signout_button');

        let tokenClient;
        let gapiInited = false;
        let gisInited = false;

        authBtn.style.visibility = 'hidden';
        signoutBtn.style.visibility = 'hidden';
        authBtn.addEventListener('click', handleAuthClick);
        signoutBtn.addEventListener('click', handleSignoutClick);

        /* ---------------- Onglets ---------------- */
        document.querySelectorAll('.onglet').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.onglet').forEach(b => {
                    b.classList.toggle('actif', b === btn);
                    b.setAttribute('aria-selected', b === btn);
                });
                document.getElementById('vue-dashboard').hidden = btn.dataset.onglet !== 'dashboard';
                document.getElementById('vue-details').hidden = btn.dataset.onglet !== 'details';
            });
        });

        /* ---------------- Utilitaires ---------------- */
        function esc(s) {
            return String(s ?? '').replace(/[&<>"]/g, c =>
                ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        }

        function normaliser(s) {
            return String(s ?? '').trim().toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        // "1 558,69 €" -> 1558.69
        function parseMontant(s) {
            if (typeof s === 'number') return s;
            if (!s) return 0;
            const n = parseFloat(String(s).replace(/[^\d,.\-]/g, '').replace(',', '.'));
            return isNaN(n) ? 0 : n;
        }

        function trouverLigne(values, label) {
            const cible = normaliser(label);
            return values.find(r => normaliser(r[0]) === cible) || [];
        }

        // k = 0 : Madame, k = 1 : Monsieur
        function cellule(ligne, mois, k) {
            return ligne[1 + 2 * mois + k];
        }

        // Une couleur de fond Google ({red, green, blue}, de 0 à 1) est-elle verte ?
        function estVert(c) {
            const r = c?.red ?? 0, g = c?.green ?? 0, b = c?.blue ?? 0;
            return g > 0.4 && g - r > 0.04 && g - b > 0.04;
        }

        const VERT_PAR_DEFAUT = { red: 0.714, green: 0.843, blue: 0.659 }; // #b6d7a8

        // Un mois est réglé si l'une de ses deux cases (Madame / Monsieur) de la ligne "Reglé ?" a un fond vert
        function moisRegle(couleurs, mois) {
            return estVert(couleurs[1 + 2 * mois]) || estVert(couleurs[2 + 2 * mois]);
        }

        function afficherMessage(texte) {
            const html = `<p class="info">${esc(texte)}</p>`;
            dashboardEl.innerHTML = html;
            contentEl.innerHTML = html;
        }

        // Petit message de retour dans un encart (type : 'ok' ou 'erreur')
        function setStatut(id, texte, type = '') {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = texte;
            el.className = 'statut ' + type;
        }

        // Chargement de toute la page : un loader à la place du contenu
        function afficherChargement() {
            const html = '<div class="loader" role="status" aria-label="Chargement en cours"></div>';
            dashboardEl.innerHTML = html;
            contentEl.innerHTML = html;
        }

        // Chargement partiel : effet shimmer sur les encarts concernés
        const ZONES = {
            depense: ['[data-bloc="depenses"]', '[data-bloc="mois"]', '#content'],
            regle: ['[data-bloc="equilibrage"]', '#content'],
        };

        function shimmer(selecteurs, actif) {
            selecteurs.forEach(sel =>
                document.querySelectorAll(sel).forEach(el => el.classList.toggle('shimmer', actif)));
        }

        function messageErreur(err) {
            if (err?.status === 401) return 'Session expirée. Cliquez sur Authorize.';
            if (err?.status === 403) return "Écriture refusée : cliquez sur Sign Out puis Authorize pour accorder l'accès en modification.";
            return err?.result?.error?.message || err?.message || 'Erreur inconnue.';
        }

        /* ---------------- Tableau de bord ---------------- */
        const MOIS_COURT = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil',
            'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
        const COULEURS = { global: '#f2f2f2', madame: '#ff9ac8', monsieur: '#7ab8ff' };
        const fmtCourt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

        // Valeurs de Janvier jusqu'au mois en cours (k = 0 Madame, 1 Monsieur)
        function serie(ligne, k) {
            return Array.from({ length: MOIS_COURANT + 1 }, (_, m) => parseMontant(cellule(ligne, m, k)));
        }

        // Graduation "ronde" pour l'axe vertical
        function echelle(max) {
            const brut = max / 4;
            const puiss = Math.pow(10, Math.floor(Math.log10(brut)));
            const pas = [1, 2, 2.5, 5, 10].map(f => f * puiss).find(p => p >= brut);
            return { pas, haut: Math.ceil(max / pas) * pas };
        }

        function graphiqueLignes(series, titre) {
            const W = 600, H = 260, pl = 62, pr = 16, pt = 14, pb = 30;
            const n = series[0].valeurs.length;
            const max = Math.max(1, ...series.flatMap(s => s.valeurs));
            const { pas, haut } = echelle(max);
            const x = i => pl + (n === 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1));
            const y = v => pt + (1 - v / haut) * (H - pt - pb);

            let svg = `<svg class="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titre)}">`;

            // Grille horizontale + valeurs
            for (let i = 0; i * pas <= haut + 1e-9; i++) {
                const v = i * pas;
                svg += `<line class="g" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/>`;
                svg += `<text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${fmtCourt.format(v)} €</text>`;
            }

            // Mois
            for (let i = 0; i < n; i++) {
                const cls = i === MOIS_COURANT ? ' class="mc"' : '';
                svg += `<text${cls} x="${x(i)}" y="${H - 9}" text-anchor="middle">${MOIS_COURT[i]}</text>`;
            }

            // Courbes (l'ensemble est dessiné en dernier pour rester lisible)
            [...series].reverse().forEach(s => {
                const pts = s.valeurs.map((v, i) => `${x(i)},${y(v)}`).join(' ');
                svg += `<polyline points="${pts}" fill="none" stroke="${s.couleur}" stroke-width="${s.epais}" stroke-linejoin="round" stroke-linecap="round"/>`;
                s.valeurs.forEach((v, i) => {
                    svg += `<circle cx="${x(i)}" cy="${y(v)}" r="${i === MOIS_COURANT ? 5 : 3.5}" fill="${s.couleur}"><title>${MOIS[i]} – ${s.nom} : ${fmtEuro.format(v)}</title></circle>`;
                });
            });

            return svg + '</svg>';
        }

        function blocGraphique(cle, titre, series) {
            const legende = series.map(s => `<span style="--c:${s.couleur}">${s.nom}</span>`).join('');
            return `<section class="bloc" data-bloc="${cle}">
                <h2>${titre}</h2>
                <div class="legende">${legende}</div>
                ${graphiqueLignes(series, titre)}
            </section>`;
        }

        function ligneVs(nom, depenses, revenus, couleur) {
            const pct = revenus > 0 ? depenses / revenus * 100 : 0;
            const reste = revenus - depenses;
            const texteReste = reste >= 0
                ? `Reste ${fmtEuro.format(reste)}`
                : `Dépassement de ${fmtEuro.format(-reste)}`;
            return `<div class="vs-ligne" style="--c:${couleur}">
                <div class="entete">
                    <span class="nom">${nom}</span>
                    <span>${fmtEuro.format(depenses)} dépensés sur ${fmtEuro.format(revenus)} (${Math.round(pct)}&nbsp;%)</span>
                </div>
                <div class="piste"><i style="width:${Math.min(100, pct)}%"></i></div>
                <div class="reste${reste < 0 ? ' neg' : ''}">${texteReste}</div>
            </div>`;
        }

        // Montant à équilibrer pour un mois, avec le sens :
        // positif = Madame doit à Monsieur, négatif = Monsieur doit à Madame
        function equilibrageMois(eq, theo, unit, mois) {
            const montant = parseMontant(cellule(eq, mois, 0));
            // Madame doit de l'argent si sa part théorique dépasse ce qu'elle a déjà payé
            const ecart = parseMontant(cellule(theo, mois, 0)) - parseMontant(cellule(unit, mois, 0));
            if (montant === 0 || Math.abs(ecart) <= 0.005) return 0;
            return ecart > 0 ? montant : -montant;
        }

        function phraseDette(montant) {
            const somme = fmtEuro.format(Math.abs(montant));
            return montant > 0
                ? `<span class="madame-txt">Madame</span> doit ${somme} à <span class="monsieur-txt">Monsieur</span>`
                : `<span class="monsieur-txt">Monsieur</span> doit ${somme} à <span class="madame-txt">Madame</span>`;
        }

        function renderDashboard(values, couleursRegle = []) {
            const m = MOIS_COURANT;

            const revenu = trouverLigne(values, 'Revenu');
            const unitaire = trouverLigne(values, 'Total unitaire');
            const commun = trouverLigne(values, 'Total commun');
            const theorique = trouverLigne(values, 'Théorique');
            const equilibrage = trouverLigne(values, 'Equilibrage');

            // --- Graphique des dépenses ---
            const depMadame = serie(unitaire, 0);
            const depMonsieur = serie(unitaire, 1);
            const depGlobal = serie(commun, 0);

            const blocDepenses = blocGraphique('depenses', 'Dépenses par mois', [
                { nom: 'Ensemble', couleur: COULEURS.global, valeurs: depGlobal, epais: 3 },
                { nom: 'Madame', couleur: COULEURS.madame, valeurs: depMadame, epais: 2 },
                { nom: 'Monsieur', couleur: COULEURS.monsieur, valeurs: depMonsieur, epais: 2 },
            ]);

            // --- Graphique des revenus ---
            const revMadame = serie(revenu, 0);
            const revMonsieur = serie(revenu, 1);
            const revGlobal = revMadame.map((v, i) => v + revMonsieur[i]);

            const blocRevenus = blocGraphique('revenus', 'Revenus par mois', [
                { nom: 'Ensemble', couleur: COULEURS.global, valeurs: revGlobal, epais: 3 },
                { nom: 'Madame', couleur: COULEURS.madame, valeurs: revMadame, epais: 2 },
                { nom: 'Monsieur', couleur: COULEURS.monsieur, valeurs: revMonsieur, epais: 2 },
            ]);

            // --- Mois en cours : dépenses vs revenus + équilibrage ---
            const dM = depMadame[m], dH = depMonsieur[m];
            const dT = depGlobal[m] || (dM + dH);
            const rM = revMadame[m], rH = revMonsieur[m], rT = revGlobal[m];

            // --- Équilibrage cumulé : tous les mois non réglés, de janvier au mois en cours ---
            const parMois = [];
            for (let k = 0; k <= m; k++) {
                if (moisRegle(couleursRegle, k)) continue;
                const montant = equilibrageMois(equilibrage, theorique, unitaire, k);
                if (montant !== 0) parMois.push({ mois: k, montant });
            }
            const total = parMois.reduce((t, x) => t + x.montant, 0);
            const regle = moisRegle(couleursRegle, m);

            let phraseEq;
            if (parMois.length === 0) {
                phraseEq = `<span class="info">${regle ? 'Tout est réglé.' : 'Rien à équilibrer pour le moment.'}</span>`;
            } else if (Math.abs(total) < 0.005) {
                phraseEq = '<span class="info">Les mois non réglés s\'annulent.</span>';
            } else {
                phraseEq = phraseDette(total);
            }

            // Mois à régler : ceux qui comptent dans le cumul + le mois en cours s'il n'est pas réglé
            const lignes = [];
            for (let k = 0; k <= m; k++) {
                if (moisRegle(couleursRegle, k)) continue;
                const montant = equilibrageMois(equilibrage, theorique, unitaire, k);
                if (montant !== 0 || k === m) lignes.push({ mois: k, montant });
            }

            // Dès qu'un mois précédent est encore à régler : une ligne par mois, avec son propre bouton
            const cumul = lignes.some(x => x.mois !== m);
            const titreEq = cumul ? 'Équilibrage (cumul des mois non réglés)' : 'Équilibrage';

            const texteLigne = (x) => x.montant === 0
                ? 'rien à équilibrer'
                : `${x.montant > 0 ? 'Madame' : 'Monsieur'} doit ${fmtEuro.format(Math.abs(x.montant))}`;

            const detailCumul = cumul
                ? `<div class="detail" style="margin-top:12px">${lignes.map(x =>
                    `<div class="${x.montant > 0 ? 'madame' : x.montant < 0 ? 'monsieur' : ''}">
                        <span>${MOIS[x.mois]} : ${texteLigne(x)}</span>
                        <button type="button" class="mini" data-regler="${x.mois}">Réglé</button>
                    </div>`
                ).join('')}</div>`
                : '';

            // --- Boutons "réglé" ---
            let boutonRegle = '';
            if (regle) {
                boutonRegle += `<span class="badge-regle">${MOIS[m]} réglé</span>
                    <button type="button" id="btn-annuler" class="secondaire">Annuler</button>`;
            } else if (!cumul) {
                // Seul le mois en cours est à régler
                boutonRegle += `<button type="button" data-regler="${m}">Marquer le mois comme réglé</button>`;
            }

            const blocMois = `<section class="bloc large" data-bloc="mois">
                <h2>Mois en cours</h2>
                <div class="mois-cols">
                    <div class="vs">
                        ${ligneVs('Ensemble', dT, rT, COULEURS.global)}
                        ${ligneVs('Madame', dM, rM, COULEURS.madame)}
                        ${ligneVs('Monsieur', dH, rH, COULEURS.monsieur)}
                    </div>
                    <div class="equilibrage" data-bloc="equilibrage">
                        <h3>${titreEq}</h3>
                        <h2>${phraseEq}</h2>
                        ${detailCumul}
                        <div class="regle">
                            ${boutonRegle}
                            <p class="statut" id="statut-regle" role="status"></p>
                        </div>
                    </div>
                </div>
            </section>`;

            // --- Ajouter une dépense ---
            const blocAjout = `<section class="bloc">
                <h2>Ajouter une dépense</h2>
                <form id="form-depense" class="form-depense">
                    <fieldset>
                        <legend>Payé par</legend>
                        <label class="puce puce-madame"><input type="radio" name="qui" value="0" checked><span>Madame</span></label>
                        <label class="puce puce-monsieur"><input type="radio" name="qui" value="1"><span>Monsieur</span></label>
                    </fieldset>
                    <label class="champ"><span>Montant (€)</span>
                        <input type="number" name="montant" step="0.01" inputmode="decimal" placeholder="0,00" required>
                    </label>
                    <button type="submit">Ajouter</button>
                    <p class="statut" id="statut-depense" role="status"></p>
                </form>
            </section>`;

            dashboardEl.innerHTML = `
                <h1 class="mois-titre">${MOIS[m]} ${ANNEE}</h1>
                <div class="tableau-layout">
                    <div class="grille">
                        ${blocDepenses}
                        ${blocRevenus}
                        ${blocMois}
                    </div>
                    <aside class="colonne-droite">
                        ${blocAjout}
                    </aside>
                </div>`;
        }


        /* ---------------- Détails ---------------- */
        function renderTable(values, couleursRegle = []) {
            // Complète chaque ligne jusqu'à 25 colonnes
            const rows = values.map(r => {
                const p = [...r];
                while (p.length < NB_COLS) p.push('');
                return p;
            });

            // Les lignes à partir de "Total unitaire" ne sont pas colorées
            let debutTotaux = rows.findIndex(r => normaliser(r[0]) === 'total unitaire');
            if (debutTotaux === -1) debutTotaux = Infinity;

            // Lignes dont la valeur occupe les 2 colonnes (Madame + Monsieur) d'un mois
            const lignesFusionnees = ['total commun', 'equilibrage'];

            let html = '<table class="tableau-moderne">';
            rows.forEach((row, i) => {
                const neutre = i >= debutTotaux;
                const fusion = neutre && lignesFusionnees.includes(normaliser(row[0]));

                html += '<tr>';
                row.forEach((c, j) => {
                    if (j === 0) {
                        html += `<td>${esc(c)}</td>`;
                        return;
                    }
                    const m = Math.floor((j - 1) / 2);
                    const estMadame = (j - 1) % 2 === 0;

                    if (i === 0) {
                        // Ligne des mois : une cellule sur 2 colonnes
                        if (estMadame) {
                            const courant = m === MOIS_COURANT ? ' mois-courant' : '';
                            html += `<td colspan="2" class="mois-head${courant}">${esc(c)}</td>`;
                        }
                        return;
                    }

                    if (neutre) {
                        if (fusion) {
                            if (estMadame) html += `<td colspan="2" class="neutre fusion">${esc(c)}</td>`;
                        } else {
                            const ok = normaliser(row[0]) === 'regle ?' && moisRegle(couleursRegle, m) ? ' regle-ok' : '';
                            html += `<td class="neutre${ok}">${esc(c)}</td>`;
                        }
                        return;
                    }

                    const courant = m === MOIS_COURANT ? ' mois-courant' : '';
                    const qui = estMadame ? 'madame' : 'monsieur';
                    html += `<td class="${qui}${courant}">${esc(c)}</td>`;
                });
                html += '</tr>';
            });
            return html + '</table>';
        }

        /* ---------------- Google API ---------------- */
        function gapiLoaded() {
            gapi.load('client', initializeGapiClient);
        }

        async function initializeGapiClient() {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: [DISCOVERY_DOC],
            });

            try {
                const saved = JSON.parse(localStorage.getItem(CLE_TOKEN) || 'null');
                if (saved && saved.expires_at > Date.now()) {
                    gapi.client.setToken(saved.token);
                }
            } catch (e) { }

            gapiInited = true;
            maybeEnableButtons();
        }

        function gisLoaded() {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: '', // défini plus tard
            });
            gisInited = true;
            maybeEnableButtons();
        }

        function maybeEnableButtons() {
            if (gapiInited && gisInited) {
                authBtn.style.visibility = 'visible';
                if (gapi.client.getToken()) {
                    signoutBtn.style.visibility = 'visible';
                    authBtn.innerText = 'Refresh';
                    chargerDonnees();
                }
            }
        }

        function handleAuthClick() {
            tokenClient.callback = async (resp) => {
                if (resp.error !== undefined) {
                    throw (resp);
                }
                signoutBtn.style.visibility = 'visible';
                authBtn.innerText = 'Refresh';

                const token = gapi.client.getToken();
                localStorage.setItem(CLE_TOKEN, JSON.stringify({
                    token,
                    expires_at: Date.now() + (Number(resp.expires_in) - 60) * 1000
                }));

                await chargerDonnees();
            };

            if (gapi.client.getToken() === null) {
                tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                tokenClient.requestAccessToken({ prompt: '' });
            }
        }

        function handleSignoutClick() {
            const token = gapi.client.getToken();
            if (token !== null) {
                google.accounts.oauth2.revoke(token.access_token);
                gapi.client.setToken('');
                localStorage.removeItem(CLE_TOKEN);
                afficherMessage('Déconnecté. Cliquez sur Authorize pour recharger les données.');
                authBtn.innerText = 'Authorize';
                signoutBtn.style.visibility = 'hidden';
            }
        }

        // Lecture brute de la feuille (sans affichage)
        async function lireFeuille() {
            const r = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: RANGE,
            });
            return r.result?.values || [];
        }

        // silencieux = true : pas de loader (utilisé après une action, où le shimmer est déjà affiché)
        async function chargerDonnees({ silencieux = false } = {}) {
            if (!silencieux) afficherChargement();
            try {
                await chargerDonneesInterne();
            } finally {
                contentEl.classList.remove('shimmer');
            }
        }

        async function chargerDonneesInterne() {
            let values;
            try {
                values = await lireFeuille();
            } catch (err) {
                if (err.status === 401) {
                    localStorage.removeItem(CLE_TOKEN);
                    gapi.client.setToken('');
                    authBtn.innerText = 'Authorize';
                    signoutBtn.style.visibility = 'hidden';
                    afficherMessage('Session expirée. Cliquez sur Authorize.');
                    return;
                }
                afficherMessage(messageErreur(err));
                return;
            }

            if (values.length === 0) {
                afficherMessage('Aucune valeur trouvée.');
                return;
            }

            // Couleurs de la ligne "Reglé ?" (fond vert = mois réglé)
            let couleurs = [];
            const iRegle = values.findIndex(r => normaliser(r[0]) === 'regle ?');
            if (iRegle !== -1) {
                try {
                    couleurs = (await lireFormatRegle(iRegle + 1)).couleurs;
                } catch (err) {
                    console.warn('Impossible de lire les couleurs de la ligne « Reglé ? »', err);
                }
            }

            renderDashboard(values, couleurs);
            contentEl.innerHTML = renderTable(values, couleurs);
        }

        /* ---------------- Écriture dans la feuille ---------------- */
        function lettreColonne(n) { // 0 -> A, 25 -> Z
            let s = '';
            for (n++; n > 0; n = Math.floor((n - 1) / 26)) {
                s = String.fromCharCode(65 + (n - 1) % 26) + s;
            }
            return s;
        }

        async function ecrireCellule(ref, valeur) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `'${ONGLET}'!${ref}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[valeur]] },
            });
        }

        // Écrit le montant dans la première cellule libre de la colonne de la personne, pour le mois en cours
        // qui : 0 = Madame, 1 = Monsieur
        async function ajouterDepense(qui, montant) {
            const values = await lireFeuille(); // lecture fraîche pour ne rien écraser
            const debut = values.findIndex(r => normaliser(r[0]) === 'depenses');
            const fin = values.findIndex(r => normaliser(r[0]) === 'total unitaire');
            if (debut === -1 || fin === -1) {
                throw new Error('Lignes « Dépenses » et « Total unitaire » introuvables dans la feuille.');
            }

            const col = 1 + 2 * MOIS_COURANT + qui;
            for (let i = debut; i < fin; i++) {
                const v = values[i]?.[col];
                if (v === undefined || String(v).trim() === '') {
                    await ecrireCellule(`${lettreColonne(col)}${i + 1}`, montant);
                    return;
                }
            }
            throw new Error('Plus de ligne libre dans la colonne de ce mois : ajoutez des lignes dans la feuille.');
        }

        // Couleurs de fond de la ligne "Reglé ?" (ligne = numéro de ligne dans la feuille, à partir de 1)
        async function lireFormatRegle(ligne) {
            const r = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: SPREADSHEET_ID,
                ranges: [`'${ONGLET}'!A${ligne}:Y${ligne}`],
                includeGridData: true,
                fields: 'sheets(properties(sheetId),data(rowData(values(effectiveFormat(backgroundColor)))))',
            });
            const feuille = r.result.sheets[0];
            const cases = feuille.data?.[0]?.rowData?.[0]?.values || [];
            return {
                sheetId: feuille.properties.sheetId,
                couleurs: cases.map(c => c.effectiveFormat?.backgroundColor),
            };
        }

        // valeur = true : fond vert sur les 2 cases de chaque mois de la liste (Madame + Monsieur) ; false : fond supprimé
        async function definirRegle(valeur, listeMois) {
            const boutons = document.querySelectorAll('[data-regler], #btn-annuler');
            boutons.forEach(b => b.disabled = true);
            shimmer(ZONES.regle, true);
            try {
                const values = await lireFeuille();
                const i = values.findIndex(r => normaliser(r[0]) === 'regle ?');
                if (i === -1) throw new Error('Ligne « Reglé ? » introuvable dans la feuille.');

                const { sheetId, couleurs } = await lireFormatRegle(i + 1);
                // On réutilise le vert déjà présent sur la ligne, pour rester cohérent avec les autres mois
                const v = couleurs.find(estVert);
                const vert = v ? { red: v.red ?? 0, green: v.green ?? 0, blue: v.blue ?? 0 } : VERT_PAR_DEFAUT;

                const requests = listeMois.map(k => ({
                    repeatCell: {
                        range: {
                            sheetId,
                            startRowIndex: i, endRowIndex: i + 1,
                            startColumnIndex: 1 + 2 * k, endColumnIndex: 3 + 2 * k, // colonnes Madame + Monsieur du mois
                        },
                        cell: { userEnteredFormat: valeur ? { backgroundColor: vert } : {} },
                        fields: 'userEnteredFormat.backgroundColor',
                    },
                }));
                await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: SPREADSHEET_ID,
                    resource: { requests },
                });

                await chargerDonnees({ silencieux: true });
                const message = valeur ? `${MOIS[listeMois[0]]} marqué comme réglé.` : 'Réglé annulé.';
                setStatut('statut-regle', message, 'ok');
            } catch (err) {
                shimmer(ZONES.regle, false);
                setStatut('statut-regle', messageErreur(err), 'erreur');
                boutons.forEach(b => b.disabled = false);
            }
        }

        // Le tableau de bord est reconstruit à chaque chargement : on écoute donc sur le conteneur
        dashboardEl.addEventListener('click', (e) => {
            const marquer = e.target.closest('[data-regler]');
            if (marquer) {
                definirRegle(true, [Number(marquer.dataset.regler)]);
                return;
            }
            if (e.target.closest('#btn-annuler')) definirRegle(false, [MOIS_COURANT]);
        });

        dashboardEl.addEventListener('submit', async (e) => {
            if (e.target.id !== 'form-depense') return;
            e.preventDefault();

            const form = e.target;
            const qui = Number(form.elements['qui'].value);
            const montant = parseFloat(String(form.elements['montant'].value).replace(',', '.'));
            if (!isFinite(montant) || montant === 0) {
                setStatut('statut-depense', 'Saisissez un montant valide.', 'erreur');
                return;
            }

            const bouton = form.querySelector('button[type="submit"]');
            bouton.disabled = true;
            shimmer(ZONES.depense, true);
            try {
                await ajouterDepense(qui, montant);
                await chargerDonnees({ silencieux: true });
                setStatut('statut-depense',
                    `Ajouté en ${MOIS[MOIS_COURANT].toLowerCase()} : ${fmtEuro.format(montant)} pour ${qui === 0 ? 'Madame' : 'Monsieur'}.`, 'ok');
            } catch (err) {
                shimmer(ZONES.depense, false);
                setStatut('statut-depense', messageErreur(err), 'erreur');
                bouton.disabled = false;
            }
        });
