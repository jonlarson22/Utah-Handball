function adminLogin(email, password) {
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        isAdmin = true;

        document.body.classList.add('admin-mode'); 
        showToast("Admin Verified!");
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
        showToast("Logged out.");
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

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.style.background = isError ? "#e74c3c" : "#2ecc71";
    
    toast.style.display = "block";
    setTimeout(() => { 
        toast.style.opacity = "1"; 
        toast.style.top = "20px";
    }, 10);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.top = "-50px";
        setTimeout(() => { toast.style.display = "none"; }, 300);
    }, 3000);
}

function addPlayer() {
    const n = document.getElementById('addN').value.trim();
    const isMem = document.getElementById('addMember').checked;
    if(n) { 
        players.push({
            id: Date.now(), name: n, singles: 1000, doubles: 1000, 
            baseS: 1000, baseD: 1000, peakS: 1000, peakD: 1000, 
            active: true, isMember: isMem
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
        p.isMember = document.getElementById('editMember').checked;
        
        const inputS = parseFloat(document.getElementById('editS').value);
        const inputD = parseFloat(document.getElementById('editD').value);

        if(!isNaN(inputS) && inputS !== p.singles) {
            p.singles = inputS; p.baseS = inputS; p.peakS = inputS;
        }
        if(!isNaN(inputD) && inputD !== p.doubles) {
            p.doubles = inputD; p.baseD = inputD; p.peakD = inputD;
        }
        save(); 
        showToast("Player updated!"); 
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

    const winners = rawWinners.filter(id => id !== "0").map(Number);
	const losers = rawLosers.filter(id => id !== "0").map(Number);

    if (isAdmin) {
        calculateAndAddMatch(activeMode, winners, losers, games);
        save(); 
        showToast("Match recorded and rankings updated!");
    } else {
        db.ref('pending').push({
            id: Date.now(),
            mode: activeMode,
            winners: winners,
            losers: losers,
            games: games,
            submittedAt: new Date().toISOString()
        });
        showToast("Match submitted for review!");
    }

    ['g1_w','g2_w','g3_w','g1_l','g2_l','g3_l'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
}
function calculateAndAddMatch(activeMode, winners, losers, games) {
    const winObjs = players.filter(p => winners.some(wId => wId == p.id));
    const lossObjs = players.filter(p => losers.some(lId => lId == p.id));

    if (winObjs.length === 0 || lossObjs.length === 0) {
        console.error("Math Engine Error: Could not find players for IDs:", winners, losers);
        return;
    }

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

function resolvePlayerId(input) {
    if (!isNaN(input) && Number(input) > 0) return Number(input);

    if (typeof input === 'string') {
        const found = players.find(p => p.name.toLowerCase() === input.trim().toLowerCase());
        return found ? found.id : 0;
    }
 
    if (typeof input === 'object' && input !== null && input.name) {
        const found = players.find(p => p.name.toLowerCase() === input.name.trim().toLowerCase());
        return found ? found.id : 0;
    }
    
    return 0;
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
        const wNames = (m.winners || []).map(w => {
            const id = resolvePlayerId(w);
            return players.find(p => p.id == id)?.name || "??";
        }).join('/');
        
        const lNames = (m.losers || []).map(l => {
            const id = resolvePlayerId(l);
            return players.find(p => p.id == id)?.name || "??";
        }).join('/');

        const gamesList = m.games || m.detailedGames || [];
        const scoreStr = gamesList.map(g => `${g.w}-${g.l}`).join(', ');
        const displayMode = (m.mode || 'singles').toUpperCase();
        
        html += `
    <div style="background: #1a1a1a; border-left: 5px solid #f1c40f; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border-radius: 4px;">
        <div>
            <div style="font-size: 14px; font-weight: bold;">${wNames} <span style="color:#888; font-weight:normal;">def.</span> ${lNames}</div>
            <div style="font-size: 12px; color: #f1c40f; margin-top: 4px;">Scores: ${scoreStr} | <span style="color:#666">${displayMode}</span></div>
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

    const winners = m.winners.map(resolvePlayerId).filter(id => id !== 0);
    const losers = m.losers.map(resolvePlayerId).filter(id => id !== 0);
    const gamesToProcess = m.games || m.detailedGames || [];
    const historyCountBefore = history.length;

    calculateAndAddMatch(m.mode || 'singles', winners, losers, gamesToProcess);

    if (history.length > historyCountBefore) {
        db.ref(`pending/${m.firebaseKey}`).remove();
        save();
        showToast("Match Approved!");
    } else {
        alert("Error: Match could not be processed.");
    }
}

function reviewSub(index) {
    const m = pending[index];
    if (!m) return;

    setMode(m.mode || 'singles');

    ['g1_w','g1_l','g2_w','g2_l','g3_w','g3_l'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const mappedWinners = (m.winners || []).map(resolvePlayerId);
    const mappedLosers = (m.losers || []).map(resolvePlayerId);

    document.getElementById('w1').value = mappedWinners[0] || "0";
    document.getElementById('l1').value = mappedLosers[0] || "0";

    if ((m.mode || 'singles') === 'doubles') {
        document.getElementById('w2').value = mappedWinners[1] || "0";
        document.getElementById('l2').value = mappedLosers[1] || "0";
    }

    const gamesList = m.games || m.detailedGames || [];
    if (gamesList && Array.isArray(gamesList)) {
        gamesList.forEach((g, i) => {
            const num = i + 1;
            const wInput = document.getElementById(`g${num}_w`);
            const lInput = document.getElementById(`g${num}_l`);
            if (wInput) wInput.value = g.w;
            if (lInput) lInput.value = g.l;
        });
    }

   if (m.firebaseKey) {
        db.ref(`pending/${m.firebaseKey}`).remove()
            .then(() => console.log("Match moved to Editor."))
            .catch(err => console.error("Error removing match:", err));
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("Match loaded. Review then click 'SUBMIT SCORE' to finalize.");
}

function rejectSub(index) {
    const m = pending[index];
    if (!m) return;

    if (confirm("Permanently delete this submission?")) {
        if (m.firebaseKey) {
            db.ref(`pending/${m.firebaseKey}`).remove()
                .then(() => console.log("Match rejected."))
                .catch((error) => console.error("Rejection failed:", error));
        }
    }
}
	
function runH2H() {
    const idA = document.getElementById('h2hA').value;
    const idB = document.getElementById('h2hB').value;
    
    if (idA === "0" || idB === "0" || idA === idB) { 
        document.getElementById('h2hResults').style.display = 'none'; 
        return; 
    }
    
    let winsA = 0, winsB = 0, total = 0, recentHTML = "";
    
    history.forEach(m => {
        console.log("Checking match:", m.mode, "against", h2hMode);
    	if (m.mode !== h2hMode) return; 

        const aInW = m.winners.some(id => id == idA);
        const aInL = m.losers.some(id => id == idA);
        const bInW = m.winners.some(id => id == idB);
        const bInL = m.losers.some(id => id == idB);
        
        if ((aInW && bInL) || (aInL && bInW)) {
            total++;
            if (aInW) winsA++; else winsB++;
            
           if (total <= 5) {
    const isDoubles = m.mode === 'doubles';
    const wNames = m.winners.map(id => players.find(x => x.id == id)?.name || "??").join('/');
    const lNames = m.losers.map(id => players.find(x => x.id == id)?.name || "??").join('/');

    const isFirst = (total === 1);

    let matchupHTML = "";
    if (isDoubles) {
        matchupHTML = `
            <div style="line-height: 1.2;">
                <div style="color: #2ecc71;">${wNames}</div>
                <div style="font-size: 9px; color: #666; margin: 2px 0;">— VS —</div>
                <div style="color: #e74c3c;">${lNames}</div>
            </div>`;
    } else {
        matchupHTML = `
            <span style="color: #2ecc71;">${wNames}</span> 
            <small style="color:#666; margin: 0 4px;">vs</small> 
            <span style="color: #e74c3c;">${lNames}</span>`;
    }

    recentHTML += `
        <div class="h2h-recent-item" style="display: flex; justify-content: space-between; align-items: center; 
            padding: ${isFirst ? '0 0 10px 0' : '10px 0'}; 
            ${isFirst ? '' : 'border-top: 1px solid #333;'}">
            <div style="font-size: 11px;">${matchupHTML}</div>
            <div style="text-align: right; min-width: 60px;">
                <div style="font-weight: bold; color: #fff;">${m.score}</div>
                <div style="font-size: 10px; color: #888;">${getGameString(m)}</div>
            </div>
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
            showToast("Import complete!");
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

    const winObjs = players.filter(p => m.winners.some(id => id == p.id));
	const lossObjs = players.filter(p => m.losers.some(id => id == p.id));

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

    if (isAdmin) {
        console.log("Attempting Firebase Sync...");
        db.ref('/').update({
            players: players,
            history: history
        }).then(() => {
            console.log("Firebase Sync Success ✅");
        }).catch(err => {
            console.error("Firebase Sync FAILED ❌:", err);
        });
    }
    render();
    runH2H();
}

    function filterTable() {
    const searchInput = document.getElementById('playerSearch');
    const body = document.getElementById('leaderboardBody');
    const controls = document.getElementById('paginationControls');
    if (!body || !searchInput) return;

    const searchTerm = searchInput.value.toLowerCase();
    const view = currentView; 
    const peakKey = view === 'singles' ? 'peakS' : 'peakD';

    const globalRanked = [...players]
        .filter(p => !p.hidden && p.isMember !== false)
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
    showToast(`${p.name} is now ${hide ? 'Retired' : 'Active'}!`);
}

function loadPlayer() {
    const selectedID = document.getElementById('editList').value;
    const p = players.find(x => x.id == selectedID);

    if(p) {
        document.getElementById('editN').value = p.name;
        document.getElementById('editS').value = p.singles || 1000;
        document.getElementById('editD').value = p.doubles || 1000;
        document.getElementById('editMember').checked = p.isMember !== false; 
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
