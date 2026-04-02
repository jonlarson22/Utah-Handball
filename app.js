function adminLogin(email, password) {
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        isAdmin = true;
        // This is the line that makes the admin buttons actually appear:
        document.body.classList.add('admin-mode'); 
        alert("Admin Verified!");
        render();
      })
      .catch((error) => {
        console.error("Login Error:", error.message);
        alert("Access Denied: " + error.message);
      });
}
let isAdmin = false;

function checkAdmin() {
    if (isAdmin) {
        firebase.auth().signOut();
        isAdmin = false;
        document.body.classList.remove('admin-mode');
        alert("Logged out.");
        render();
        return;
    }

    const email = prompt("Admin Email:");
    const pass = prompt("Admin Password:");
    
    if (email && pass) {
        adminLogin(email, pass);
    }
}

const firebaseConfig = {
  apiKey: "AIzaSyCCV_WHA1Q7WKawfG68Y9z40xINVg5zbmw",
  authDomain: "utah-handball.firebaseapp.com",
  databaseURL: "https://utah-handball-default-rtdb.firebaseio.com",
  projectId: "utah-handball",
  storageBucket: "utah-handball.firebasestorage.app",
  messagingSenderId: "4109545863",
  appId: "1:4109545863:web:6a6de7f532be0bc20f2322"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let players = [];
let history = [];
let pending = [];	
let mode = 'singles';	
let currentView = 'singles';
let h2hMode = 'singles';
let currentPage = 1;
const rowsPerPage = 20;

db.ref('/').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        players = data.players || [];
        history = data.history || [];
        
        const pendingData = data.pending || {};
        pending = Object.keys(pendingData).map(key => ({
            ...pendingData[key],
            firebaseKey: key
        }));
        
        render(); 
        if (isAdmin) renderQueue();
        
        const syncStatus = document.getElementById('syncStatus');
        if (syncStatus) {
            syncStatus.innerText = "Realtime Connected ✅";
            syncStatus.style.color = "#2ecc71";
        }
    } else {
        render();
    }
}, (error) => {
    console.error("Firebase Load Failed:", error);
    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) {
        syncStatus.innerText = "Connection Failed";
        syncStatus.style.color = "#e74c3c";
    }
});

	function setView(v) { 
    currentView = v;
    currentPage = 1;
    
    const btnS = document.getElementById('vS');
    const btnD = document.getElementById('vD');
    if (btnS) btnS.classList.toggle('active-tab', v === 'singles');
    if (btnD) btnD.classList.toggle('active-tab', v === 'doubles');
    
    filterTable();
}

    function setMode(m) { 
    mode = m; 
    document.getElementById('tS').classList.toggle('active-tab', m === 'singles');
    document.getElementById('tD').classList.toggle('active-tab', m === 'doubles');
    document.querySelectorAll('.d-only').forEach(e => e.classList.toggle('hidden', m === 'singles'));
    
    if (m === 'singles') {
        const w2 = document.getElementById('w2');
        const l2 = document.getElementById('l2');
        if (w2) w2.value = "0";
        if (l2) l2.value = "0";
    }
}

function setH2HMode(m) {
    h2hMode = m;
    document.getElementById('h2hTS').classList.toggle('active-tab', m === 'singles');
    document.getElementById('h2hTD').classList.toggle('active-tab', m === 'doubles');
    runH2H(); 
}

function addPlayer() {
    const n = document.getElementById('addN').value.trim();
    if(n) { 
        players.push({
            id: Date.now(), 
            name: n, 
            singles: 1000, 
            doubles: 1000, 
            baseS: 1000,
            baseD: 1000,
            peakS: 1000,
            peakD: 1000,
            active: true
        }); 
        save(); 
        document.getElementById('addN').value = ''; 
        filterTable(); 
    }
}
function loadEditData() {
    const p = players.find(x => x.id == document.getElementById('editList').value);
    if(p) { 
        document.getElementById('editN').value = p.name; 
        document.getElementById('editS').value = p.singles; 
        document.getElementById('editD').value = p.doubles; 
    }
}

    function updatePlayer() {
    const p = players.find(x => x.id == document.getElementById('editList').value);
    const newName = document.getElementById('editN').value.trim();
    
    if(p && newName) { 
        p.name = newName; 
        
        const inputS = parseFloat(document.getElementById('editS').value);
        const inputD = parseFloat(document.getElementById('editD').value);

        if(!isNaN(inputS) && inputS !== p.singles) {
            p.singles = inputS;
            p.baseS = inputS; 
            p.peakS = inputS;
        }

        if(!isNaN(inputD) && inputD !== p.doubles) {
            p.doubles = inputD;
            p.baseD = inputD; 
            p.peakD = inputD;
        }

        save(); 
        alert("Player updated! (Baselines only changed if ratings were modified)"); 
    }
}

    function processMatch() {
    const w1ID = document.getElementById('w1').value;
    const w2ID = document.getElementById('w2').value;
    const l1ID = document.getElementById('l1').value;
    const l2ID = document.getElementById('l2').value;
    
    const activeMode = mode || 'singles';
    let games = [];

    for(let i=1; i<=3; i++) { 
        const wVal = parseInt(document.getElementById(`g${i}_w`).value);
        const lVal = parseInt(document.getElementById(`g${i}_l`).value);
        if(!isNaN(wVal) && !isNaN(lVal)) {
            games.push({w: wVal, l: lVal});
        }
    }
    
    if(w1ID === "0" || l1ID === "0" || games.length === 0) {
        return alert("Please select players and enter scores.");
    }

    let rawWinners = activeMode === 'singles' ? [w1ID] : [w1ID, w2ID];
    let rawLosers = activeMode === 'singles' ? [l1ID] : [l1ID, l2ID];

    const winners = rawWinners.filter(id => id !== "0" && id !== "");
    const losers = rawLosers.filter(id => id !== "0" && id !== "");

    if (isAdmin) {
        calculateAndAddMatch(activeMode, winners, losers, games);
        save(); 
        alert("Match recorded and rankings updated!");
    } else {
        db.ref('pending').push({
            id: Date.now(),
            mode: activeMode,
            winners: winners,
            losers: losers,
            games: games,
            submittedAt: new Date().toISOString()
        });
        alert("Match submitted for review! An admin will approve it shortly.");
    }

    ['g1_w','g2_w','g3_w','g1_l','g2_l','g3_l'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
}
function calculateAndAddMatch(activeMode, winners, losers, games) {
    const winObjs = players.filter(p => winners.includes(p.id.toString()));
    const lossObjs = players.filter(p => losers.includes(p.id.toString()));

    let setsW = 0, setsL = 0, tW = 0, tL = 0;
    games.forEach(g => {
        tW += g.w; tL += g.l;
        if(g.w > g.l) setsW++; else setsL++;
    });

    const avgW = winObjs.reduce((a, b) => a + (b[activeMode] || 1000), 0) / winObjs.length;
    const avgL = lossObjs.reduce((a, b) => a + (b[activeMode] || 1000), 0) / lossObjs.length;
    const baseGain = 15 * (Math.pow((tW - tL + 24), 0.7) / (7.5 + (0.01 * (avgW - avgL))));
    
    let impactMap = {}; 
    let peakKey = activeMode === 'singles' ? 'peakS' : 'peakD';
    let oldPeaks = {};

    [...winObjs, ...lossObjs].forEach(p => { oldPeaks[p.id] = p[peakKey] || 1000; });

    winObjs.forEach(p => {
        let ratio = activeMode === 'doubles' ? (p[activeMode] / (avgW * winObjs.length)) * 2 : 1;
        let pts = Math.round((baseGain * Math.min(1.25, Math.max(0.75, ratio))) * 10) / 10;
        p[activeMode] = Math.round((p[activeMode] + pts) * 10) / 10;
        if (p[activeMode] > (p[peakKey] || 0)) p[peakKey] = p[activeMode];
        impactMap[p.id] = pts;
    });

    lossObjs.forEach(p => {
        let ratio = activeMode === 'doubles' ? (p[activeMode] / (avgL * lossObjs.length)) * 2 : 1;
        let pts = Math.round((baseGain * Math.min(1.25, Math.max(0.75, ratio))) * 10) / 10;
        p[activeMode] = Math.round((p[activeMode] - pts) * 10) / 10;
        impactMap[p.id] = -pts;
    });

    history.unshift({ 
        id: Date.now(), 
        mode: activeMode, 
        winners, losers,  
        score: `${setsW}-${setsL}`, 
        detailedGames: games,      
        impacts: impactMap,
        oldPeaks: oldPeaks
    });
}

function renderQueue() {
    const queueEl = document.getElementById('adminQueue');
    if (!queueEl) return;
    
    if (pending.length === 0) {
        queueEl.innerHTML = "";
        return;
    }

    let html = `<h2 style="color: #f1c40f; border-bottom: 1px solid #f1c40f; padding-bottom: 10px;">⚠️ Pending Approvals (${pending.length})</h2>`;
    
    pending.forEach((m, index) => {
        const wNames = m.winners.map(id => players.find(p => p.id == id)?.name || "??").join('/');
        const lNames = m.losers.map(id => players.find(p => p.id == id)?.name || "??").join('/');
        const scoreStr = m.games.map(g => `${g.w}-${g.l}`).join(', ');
        
        html += `
    <div style="background: #1a1a1a; border-left: 5px solid #f1c40f; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px;">
        <div>
            <div style="font-size: 14px; font-weight: bold;">${wNames} <span style="color:#888; font-weight:normal;">def.</span> ${lNames}</div>
            <div style="font-size: 12px; color: #f1c40f; margin-top: 4px;">Scores: ${scoreStr} | <span style="color:#666">${m.mode.toUpperCase()}</span></div>
        </div>
        <div style="display: flex; gap: 8px;">
            <button onclick="approveMatch(${index})" style="background: #2ecc71; color: white; border: none; padding: 8px 12px; cursor: pointer; border-radius: 4px; font-weight: bold;">APPROVE</button>
            
            <button onclick="reviewSub(${index})" style="background: #3498db; color: white; border: none; padding: 8px 12px; cursor: pointer; border-radius: 4px;">REVIEW/EDIT</button>
            
            <button onclick="rejectSub(${index})" style="background: #e74c3c; color: white; border: none; padding: 8px 12px; cursor: pointer; border-radius: 4px;">REJECT</button>
        </div>
    </div>`;
    });
    queueEl.innerHTML = html;
}

	function approveMatch(index) {
	    const m = pending[index];
	    if (!m) return;
	
	    const cleanWinners = m.winners.map(id => id.toString());
	    const cleanLosers = m.losers.map(id => id.toString());
	
	    console.log("Approving Match for:", cleanWinners, "vs", cleanLosers);
	
		    calculateAndAddMatch(m.mode, cleanWinners, cleanLosers, m.games);
	
	    if (m.firebaseKey) {
	        db.ref(`pending/${m.firebaseKey}`).remove()
	            .then(() => console.log("Cloud Queue Cleaned"))
	            .catch(e => console.error("Firebase Error:", e));
	    }
	
	    pending.splice(index, 1);

	    save(); 
	    alert("Match Approved and ELO Updated!");
	}

function reviewSub(index) {
    const m = pending[index];
    if (!m) return;

    setMode(m.mode);

    ['g1_w','g1_l','g2_w','g2_l','g3_w','g3_l'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    document.getElementById('w1').value = m.winners[0] || "0";
    document.getElementById('l1').value = m.losers[0] || "0";

    if (m.mode === 'doubles') {
        document.getElementById('w2').value = m.winners[1] || "0";
        document.getElementById('l2').value = m.losers[1] || "0";
    }

    if (m.games && Array.isArray(m.games)) {
        m.games.forEach((g, i) => {
            const num = i + 1;
            const wInput = document.getElementById(`g${num}_w`);
            const lInput = document.getElementById(`g${num}_l`);
            if (wInput) wInput.value = g.w;
            if (lInput) lInput.value = g.l;
        });
    }

    if (m.firebaseKey) {
        db.ref(`pending/${m.firebaseKey}`).remove()
            .then(() => console.log("Match moved from Queue to Editor."))
            .catch(err => console.error("Error removing match from queue:", err));
    }

    pending.splice(index, 1);
    save();

    window.scrollTo({ 
        top: document.querySelector('.match-card').offsetTop - 100, 
        behavior: 'smooth' 
    });
    
    alert("Match loaded into the form. Review the scores and click 'SUBMIT SCORE' to finalize.");
}
function rejectSub(index) {
    const m = pending[index];
    if (!m) return;

    if (confirm("Permanently delete this submission?")) {
        if (m.firebaseKey) {
            db.ref(`pending/${m.firebaseKey}`).remove()
                .then(() => {
                    console.log("Match rejected and removed from Firebase.");
                })
                .catch((error) => {
                    console.error("Firebase rejection failed:", error);
                });
        }

        pending.splice(index, 1);
        save();
        renderQueue();
    }
}
	
    function runH2H() {
    const idA = document.getElementById('h2hA').value, idB = document.getElementById('h2hB').value;
    if(idA === "0" || idB === "0" || idA === idB) { 
        document.getElementById('h2hResults').style.display = 'none'; 
        return; 
    }
    
    let winsA = 0, winsB = 0, total = 0, recentHTML = "";
    
    history.forEach(m => {
        if (m.mode !== h2hMode) return; 

        const aInW = m.winners.includes(idA), aInL = m.losers.includes(idA);
        const bInW = m.winners.includes(idB), bInL = m.losers.includes(idB);
        
        if ((aInW && bInL) || (aInL && bInW)) {
            total++;
            if (aInW) winsA++; else winsB++;
            
            if (total <= 5) {
                const wNames = m.winners.map(id => players.find(x => x.id == id)?.name || "??").join('/');
                const lNames = m.losers.map(id => players.find(x => x.id == id)?.name || "??").join('/');

                recentHTML += `
                    <div class="h2h-recent-item">
                        <span>${wNames} vs ${lNames}</span> 
                        <strong>${m.score} <small style="opacity:0.6">${getGameString(m)}</small></strong>
                    </div>`;
            }
        }
    });

    document.getElementById('h2hResults').style.display = 'block';
    document.getElementById('h2hNameA').innerText = players.find(x => x.id == idA)?.name || "--";
    document.getElementById('h2hNameB').innerText = players.find(x => x.id == idB)?.name || "--";
    document.getElementById('h2hWinsA').innerText = winsA;
    document.getElementById('h2hWinsB').innerText = winsB;
    document.getElementById('h2hTotal').innerText = total;
    document.getElementById('h2hRecent').innerHTML = recentHTML || `No ${h2hMode} matches found.`;
}

function exportFullData() {
    const now = new Date();
    const fileName = `handball_backup_${now.toISOString().split('T')[0]}.json`;
    const blob = new Blob([JSON.stringify({ players, history, pending })], { type: 'application/json' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}
	
function getGameString(match) {
    if (!match.detailedGames) return ""; 
    return `(${match.detailedGames.map(g => `${g.w}-${g.l}`).join(', ')})`;
}

function importFullData(e) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            players = data.players || []; 
            history = data.history || [];
            pending = data.pending || [];
            save(); 
            alert("Import complete!");
        } catch(err) { alert("Invalid file."); }
    };
    reader.readAsText(e.target.files[0]);
}

    function undoMatch(id) {
    if(!confirm("Delete this match? This will recalculate the entire history using individual player baselines to ensure all ELO shifts are accurate.")) return;

    history = history.filter(m => m.id !== id);

    players.forEach(p => {
        p.singles = p.baseS || 1000;
        p.doubles = p.baseD || 1000;
        
        p.peakS = p.singles;
        p.peakD = p.doubles;
    });

    const chronologicalHistory = [...history].reverse();

    chronologicalHistory.forEach(match => {
        recalculateSingleMatch(match);
    });

    save();
}

function recalculateSingleMatch(m) {
    const activeMode = m.mode || 'singles';
    const peakKey = activeMode === 'singles' ? 'peakS' : 'peakD';

    const winObjs = players.filter(p => m.winners.includes(p.id.toString()));
    const lossObjs = players.filter(p => m.losers.includes(p.id.toString()));

    if (winObjs.length === 0 || lossObjs.length === 0) return;

    let tW = 0, tL = 0;
    if (m.detailedGames) {
        m.detailedGames.forEach(g => { tW += g.w; tL += g.l; });
    }

    const avgW = winObjs.reduce((a, b) => a + (b[activeMode] || 1000), 0) / winObjs.length;
    const avgL = lossObjs.reduce((a, b) => a + (b[activeMode] || 1000), 0) / lossObjs.length;

    const baseGain = 15 * (Math.pow((tW - tL + 24), 0.7) / (7.5 + (0.01 * (avgW - avgL))));

    let newImpacts = {};

    winObjs.forEach(p => {
        let ratio = activeMode === 'doubles' ? (p[activeMode] / (avgW * winObjs.length)) * 2 : 1;
        let pts = Math.round((baseGain * Math.min(1.25, Math.max(0.75, ratio))) * 10) / 10;
        
        p[activeMode] = Math.round((p[activeMode] + pts) * 10) / 10;
        
        if (p[activeMode] > (p[peakKey] || 0)) p[peakKey] = p[activeMode];
        newImpacts[p.id] = pts;
    });

    lossObjs.forEach(p => {
        let ratio = activeMode === 'doubles' ? (p[activeMode] / (avgL * lossObjs.length)) * 2 : 1;
        let pts = Math.round((baseGain * Math.min(1.25, Math.max(0.75, ratio))) * 10) / 10;
        
        p[activeMode] = Math.round((p[activeMode] - pts) * 10) / 10;
        newImpacts[p.id] = -pts;
    });

    m.impacts = newImpacts;
}

	function save() {
    localStorage.setItem('hbFullP', JSON.stringify(players));
    localStorage.setItem('hbFullH', JSON.stringify(history));
    localStorage.setItem('hbFullPending', JSON.stringify(pending));

    if (isAdmin) {
        console.log("Attempting Firebase Sync...");
        db.ref('/').update({
            players: players,
            history: history
        }).then(() => {
            console.log("Firebase Sync Success ✅");
        }).catch(err => {
            console.error("Firebase Sync FAILED ❌:", err);
            alert("Database Error: Check Console.");
        });
    } else {
        console.warn("Save ignored: Not logged in as Admin.");
    }

    render();
    runH2H();
}

    function filterTable() {
	console.log("Filtering table...");	
    const searchInput = document.getElementById('playerSearch');
    const body = document.getElementById('leaderboardBody');
    const controls = document.getElementById('paginationControls');

    if (!body || !searchInput) return;

    const searchTerm = searchInput.value.toLowerCase();

    const view = currentView; 
    const peakKey = view === 'singles' ? 'peakS' : 'peakD';

    const globalRanked = [...players]
        .filter(p => !p.hidden)
        .sort((a, b) => (b[view] || 1000) - (a[view] || 1000))
        .map((p, index) => {
            p.trueRank = index + 1;
            return p;
        });

    let filtered = globalRanked.filter(p => 
        p.name.toLowerCase().includes(searchTerm)
    );

    const totalPages = Math.ceil(filtered.length / rowsPerPage) || 1;
    const start = (currentPage - 1) * rowsPerPage;
    const paginatedItems = filtered.slice(start, start + rowsPerPage);

    body.innerHTML = paginatedItems.map((p) => `
        <tr>
            <td style="text-align: center; padding: 10px;">#${p.trueRank}</td>
            <td style="text-align: left; font-weight: 500; padding: 10px;">${p.name}</td>
            <td style="text-align: center; font-weight: bold; padding: 10px;">${Math.round(p[view] || 1000)}</td>
            <td style="text-align: center; color: #f39c12; padding: 10px;">${Math.round(p[peakKey] || p[view] || 1000)}</td>
        </tr>
    `).join('');

    if (controls) {
        if (totalPages <= 1) {
            controls.innerHTML = '';
        } else {
            controls.innerHTML = `
                <button onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''} style="width:auto; padding: 8px 15px;">Prev</button>
                <span style="color: #888; font-size: 13px;">Page ${currentPage} of ${totalPages}</span>
                <button onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''} style="width:auto; padding: 8px 15px;">Next</button>
            `;
        }
    }
		console.log("Table rendered successfully.");
}
  
function changePage(step) {
    currentPage += step;
    filterTable();
}

function changeStatus(hide) {
    const pID = document.getElementById('manageList').value;
    const p = players.find(x => x.id == pID);
    if (pID === "0") return alert("Select a player.");
    
    p.hidden = hide;
    save();
    alert(`${p.name} is now ${hide ? 'Retired' : 'Active'}!`);
}

function loadPlayer() {
    const selectedID = document.getElementById('editList').value;

    const p = players.find(x => x.id == selectedID);

    if(p) {
        document.getElementById('editN').value = p.name;
        document.getElementById('editS').value = p.singles || 1000;
        document.getElementById('editD').value = p.doubles || 1000;
    } else {
        document.getElementById('editN').value = "";
        document.getElementById('editS').value = "";
        document.getElementById('editD').value = "";
    }
}

function render() {
    filterTable(); 

    const activeOpts = '<option value="0">Select Player</option>' + 
        players.filter(p => !p.hidden)
               .sort((a,b) => a.name.localeCompare(b.name))
               .map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    const allOpts = '<option value="0">Select Player</option>' + 
        players.sort((a,b) => a.name.localeCompare(b.name))
               .map(p => `<option value="${p.id}">${p.name}${p.hidden ? ' 👻' : ''}</option>`).join('');

    ['w1','w2','l1','l2'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            const cur = el.value;
            el.innerHTML = activeOpts;
            el.value = cur;
        }
    });

    ['h2hA','h2hB','editList','manageList'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            const cur = el.value;
            el.innerHTML = allOpts;
            el.value = cur;
        }
    });

    const historyBody = document.querySelector('#historyTable tbody');
    if (historyBody) {
        historyBody.innerHTML = history.slice(0, 15).map(m => {
            const isDoubles = m.mode === 'doubles';
            
            const winNames = (m.winners || []).map(id => {
                const p = players.find(x => x.id == id);
                return p ? (p.name + (p.hidden ? ' 👻' : '')) : "Unknown";
            }).join('/');

            const lossNames = (m.losers || []).map(id => {
                const p = players.find(x => x.id == id);
                return p ? (p.name + (p.hidden ? ' 👻' : '')) : "Unknown";
            }).join('/');

            let matchupHTML = "";
            if (isDoubles) {
                matchupHTML = `
                    <div style="line-height: 1.2;">
                        <div style="color: #2ecc71;">${winNames}</div>
                        <div style="font-size: 9px; color: #666; margin: 2px 0;">— VS —</div>
                        <div style="color: #e74c3c;">${lossNames}</div>
                    </div>`;
            } else {
                matchupHTML = `<span style="color: #2ecc71;">${winNames}</span> <small style="color:#666">vs</small> <span style="color: #e74c3c;">${lossNames}</span>`;
            }

            let plusShifts = [];
            let minusShifts = [];
            if (m.impacts) {
                for (let pID in m.impacts) {
                    const p = players.find(x => x.id == pID);
                    const val = m.impacts[pID];
                    if (p) {
                        const html = `<span class="${val > 0 ? 'shift-plus' : 'shift-minus'}">${p.name} ${val > 0 ? '+' : ''}${val}</span>`;
                        if (val > 0) plusShifts.push(html);
                        else minusShifts.push(html);
                    }
                }
            }

            let shiftHTML = "";
            if (isDoubles && plusShifts.length > 0) {
                shiftHTML = `
                    <div style="line-height: 1.3;">
                        <div>${plusShifts.join(', ')}</div>
                        <div style="border-top: 1px solid #333; margin-top: 3px; padding-top: 3px;">${minusShifts.join(', ')}</div>
                    </div>`;
            } else {
                shiftHTML = plusShifts.concat(minusShifts).join(', ');
            }

            const detailedScore = m.detailedGames ? 
                `<div style="font-size:10px; color:#888;">(${m.detailedGames.map(g => `${g.w}-${g.l}`).join(', ')})</div>` : 
                '';

            return `<tr>
                <td>${m.mode ? m.mode.toUpperCase() : '---'}</td>
                <td style="font-size:11px">${matchupHTML}</td>
                <td style="text-align:center;">
                    <div style="font-weight:bold;">${m.score || '0-0'}</div>
                    ${detailedScore}
                </td>
                <td style="font-size:10px">${shiftHTML}</td>
                
                <td class="admin-only">
                    <button class="undo-btn" onclick="undoMatch(${m.id})">Delete</button>
                </td>
            </tr>`;
        }).join('');
    }
    
    document.getElementById('statP').innerText = players.length;
    document.getElementById('statM').innerText = history.length;
	if (isAdmin) renderQueue();
}
