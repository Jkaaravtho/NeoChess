// eco json, lim 18k , 1500 base
'use strict';

function initializeOpeningDatabase(data, isRawFenIndexed) {
    window.openingLibrary = [];
    window.fenToOpeningMap = {};
    window.movesToOpeningMap = {};
    
    let rawList = [];

    if (isRawFenIndexed) {
        for (const rawFen in data) {
            if (data.hasOwnProperty(rawFen)) {
                const entry = data[rawFen];
                if (entry && entry.name && entry.moves) {
                    rawList.push({
                        name: entry.name,
                        eco: entry.eco || "???",
                        moves: entry.moves,
                        fen: rawFen
                    });
                }
            }
        }
    } else {
        rawList = Array.isArray(data) ? data : [];
    }

    rawList.forEach(entry => {
        const normMoves = getNormalizedOpeningMoves(entry.moves);
        const opObj = {
            name: entry.name,
            eco: entry.eco || "???",
            moves: entry.moves,
            fen: entry.fen || null,
            normMoves: normMoves
        };
        window.openingLibrary.push(opObj);

        if (entry.fen) {
            window.fenToOpeningMap[normalizeFen(entry.fen)] = opObj;
        }

        
        window.movesToOpeningMap[normMoves] = opObj;
    });

    console.log(`Successfully mapped ${window.openingLibrary.length} openings.`);
}

async function fetchEcoOpenings() {
    try {
        const response = await fetch('./js/eco.json');
        if (!response.ok) {
            throw new Error(`HTTP network error: ${response.status}`);
        }
        const data = await response.json();
        
        const isRawFenIndexed = data && typeof data === 'object' && !Array.isArray(data) && !data.openings;
        
        if (isRawFenIndexed) {
            initializeOpeningDatabase(data, true);
        } else {
            const listData = Array.isArray(data) ? data : (data.openings || OFFLINE_OPENINGS_FALLBACK);
            initializeOpeningDatabase(listData, false);
        }
    } catch (err) {
        console.warn("CORS limits blocked file protocol fetch. Activating classic openings fallback database...", err);
        initializeOpeningDatabase(OFFLINE_OPENINGS_FALLBACK, false);
    } finally {
        renderOpeningsList();
    }
}

function parseOpeningMoves(movesStr) {
    if (!movesStr) return [];
    const cleaned = movesStr.replace(/\d+\s*\.{1,3}/g, ' ');
    return cleaned.split(/\s+/).filter(m => m.trim().length > 0);
}

function renderOpeningsList(query = '') {
    const openingsListContainer = document.getElementById('openings-list-container');
    if (!openingsListContainer) return;

    let htmlContent = '';
    let count = 0;
    const maxDisplay = 100;

    for (let i = 0; i < window.openingLibrary.length; i++) {
        const op = window.openingLibrary[i];
        if (query && !op.name.toLowerCase().includes(query) && !op.eco.toLowerCase().includes(query)) {
            continue;
        }
        
        htmlContent += `
            <div class="border-b border-cyber-border/40 pb-2 mb-2 last:border-b-0 last:pb-0 last:mb-0 text-xs">
                <div class="flex justify-between items-center gap-2 mb-1.5 font-sans">
                    <span class="font-bold text-slate-200">${op.name}</span>
                    <span class="font-mono text-[9px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-cyber-accent">${op.eco}</span>
                </div>
                <div class="grid grid-cols-2 gap-1.5">
                    <button class="py-1 px-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-semibold text-[10px] transition-colors study-op-btn" data-index="${i}">
                        Study
                    </button>
                    <button class="py-1 px-2 bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-800/40 rounded text-cyber-accent font-bold text-[10px] transition-colors practice-op-btn" data-index="${i}">
                        Practice
                    </button>
                </div>
            </div>
        `;
        count++;
        if (count >= maxDisplay) {
            htmlContent += `
                <div class="text-[10px] text-slate-500 italic text-center py-2 border-t border-cyber-border/40 mt-2">
                    Showing first ${maxDisplay} results. Refine search.
                </div>
            `;
            break;
        }
    }

    if (htmlContent === '') {
        htmlContent = `<div class="text-[10px] text-slate-500 italic text-center py-4">No matching openings found.</div>`;
    }

    openingsListContainer.innerHTML = htmlContent;

    openingsListContainer.querySelectorAll('.study-op-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.closest('button').getAttribute('data-index'), 10);
            studyOpening(idx);
            toggleSidebar();
        });
    });

    openingsListContainer.querySelectorAll('.practice-op-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.closest('button').getAttribute('data-index'), 10);
            startPracticeOpening(idx);
            toggleSidebar();
        });
    });
}

function studyOpening(openingIndex) {
    const op = window.openingLibrary[openingIndex];
    if (!op) return;

    window.activePracticeOpening = null;
    window.isReadingOpening = false;
    window.isAiMatchActive = false;
    clearAssessmentVisuals();
    window.lastRenderedBadgeFen = '';

    window.startingFen = 'start';
    window.recordedMoves = [];
    window.fenHistory = ['start'];
    window.currentHistoryIndex = 0;
    window.lastCalculatedFen = '';
    window.lastDetectedOpening = op;

    window.game.reset();
    window.board.position('start');

    const parsedMoves = parseOpeningMoves(op.moves);
    parsedMoves.forEach(m => {
        const played = window.game.move(m);
        if (played) {
            window.recordedMoves.push(played.san);
            window.fenHistory.push(window.game.fen());
        }
    });

    window.currentHistoryIndex = window.fenHistory.length - 1;
    window.board.position(window.game.fen());
    updateMoveHistory();

    if (window.engineActive) updateEnginePosition();
}

function startPracticeOpening(openingIndex) {
    const op = window.openingLibrary[openingIndex];
    if (!op) return;

    window.activePracticeOpening = op;
    window.practiceMoveIndex = 0;
    window.isReadingOpening = false;
    window.isAiMatchActive = false;
    clearAssessmentVisuals();
    window.lastRenderedBadgeFen = '';

    window.startingFen = 'start';
    window.recordedMoves = [];
    window.fenHistory = ['start'];
    window.currentHistoryIndex = 0;
    window.lastCalculatedFen = '';
    window.lastDetectedOpening = op;

    window.game.reset();
    window.board.position('start');
    updateMoveHistory();

    alert(`Practice active: Input moves for standard "${op.name}" opening line!`);

    const depthEl = document.getElementById('engine-depth');
    if (window.engineActive) {
        window.wasEngineActiveBeforePractice = true;
        toggleEngine();
        if (depthEl) depthEl.innerText = "Theory Mode";
    } else {
        window.wasEngineActiveBeforePractice = false;
    }

    const theoryBadge = document.getElementById('opening-theory-badge');
    if (theoryBadge) {
        theoryBadge.classList.remove('hidden');
        theoryBadge.innerHTML = `
            <div class="flex items-center justify-center gap-2 w-full text-center py-1">
                <img src="badges/opening.png" class="w-5 h-5 object-contain" />
                <span id="current-opening-display" class="text-xs font-bold text-cyber-accent tracking-wide uppercase">Practice: ${op.name}</span>
            </div>
        `;
    }
}

function checkPracticeCompletion() {
    if (window.activePracticeOpening) {
        const parsedMoves = parseOpeningMoves(window.activePracticeOpening.moves);
        if (window.practiceMoveIndex >= parsedMoves.length) {
            setTimeout(() => {
                alert(`Congratulations! You have correctly performed the opening sequence for "${window.activePracticeOpening.name}"!`);
                window.activePracticeOpening = null;
                window.practiceMoveIndex = 0;
                restoreEngineStateAfterPractice();
            }, 300);
        }
    }
}

function readRemainingOpening() {
    if (!window.activePracticeOpening) return;

    window.isReadingOpening = true;
    const parsedMoves = parseOpeningMoves(window.activePracticeOpening.moves);
    window.activePracticeOpening = null;
    window.practiceMoveIndex = 0;

    let i = window.currentHistoryIndex;
    const interval = setInterval(() => {
        if (i < parsedMoves.length) {
            const m = window.game.move(parsedMoves[i]);
            if (m) {
                window.recordedMoves.push(m.san);
                window.fenHistory.push(window.game.fen());
                window.currentHistoryIndex = window.fenHistory.length - 1;
                window.board.position(window.game.fen());
                updateMoveHistory();
            }
            i++;
        } else {
            clearInterval(interval);
            window.isReadingOpening = false;
            alert("Theoretical study completed. Ready for review.");
            restoreEngineStateAfterPractice();
        }
    }, 800);
}

function restoreEngineStateAfterPractice() {
    if (window.wasEngineActiveBeforePractice) {
        window.wasEngineActiveBeforePractice = false;
        if (!window.engineActive) {
            toggleEngine();
        }
    }
}

// RESTORED 
function executePracticeOpponentMove() {
    if (!window.activePracticeOpening) return;

    setTimeout(() => {
        const parsedMoves = parseOpeningMoves(window.activePracticeOpening.moves);
        const opponentMoveSan = parsedMoves[window.practiceMoveIndex];
        const opMove = window.game.move(opponentMoveSan);
        if (opMove) {
            commitPlayedMove(opMove);
            window.board.position(window.game.fen());
            updateMoveHistory();
            window.practiceMoveIndex++;
            checkPracticeCompletion();
        }
    }, 600);
}

// dih
function detectCurrentOpening() {
    const theoryBadge = document.getElementById('opening-theory-badge');
    const displayLabel = document.getElementById('current-opening-display');
    if (!theoryBadge) return null;

    let detected = null;

    // the exact sequence played so far
    const targetIdx = window.currentHistoryIndex;
    const activeMoves = window.recordedMoves.slice(0, targetIdx);
    const currentMovesArr = activeMoves.map(m => m.toLowerCase().replace(/[+#x=]/g, ''));

    if (currentMovesArr.length > 0) {
        const matches = window.openingLibrary.filter(op => {
            const opMovesArr = op.normMoves.split(/\s+/).filter(m => m.length > 0);
            if (opMovesArr.length < currentMovesArr.length) return false;
            for (let i = 0; i < currentMovesArr.length; i++) {
                if (opMovesArr[i] !== currentMovesArr[i]) return false;
            }
            return true;
        });

        if (matches.length > 0) {
            
            matches.sort((a, b) => {
                const lenA = a.normMoves.split(/\s+/).length;
                const lenB = b.normMoves.split(/\s+/).length;
                return lenA - lenB;
            });
            detected = matches[0];
        }
    }

    
    if (!detected) {
        for (let i = targetIdx; i >= 0; i--) {
            const stepFen = window.fenHistory[i];
            if (stepFen) {
                const normFen = normalizeFen(stepFen);
                if (window.fenToOpeningMap[normFen]) {
                    detected = window.fenToOpeningMap[normFen];
                    break;
                }
            }
        }
    }

    
    if (detected) {
        window.lastDetectedOpening = detected;
    }

    if (window.lastDetectedOpening) {
        theoryBadge.classList.remove('hidden');
        theoryBadge.className = "text-xs bg-cyan-950/30 border border-cyan-800/40 rounded p-2 text-cyber-accent font-mono flex items-center justify-center gap-1.5 w-full";
        theoryBadge.innerHTML = `
            <div class="flex items-center justify-center gap-2 w-full text-center py-1">
                <img src="badges/opening.png" class="w-5 h-5 object-contain" />
                <span id="current-opening-display" class="text-xs font-bold text-cyber-accent tracking-wide uppercase">
                    ${window.lastDetectedOpening.eco}: ${window.lastDetectedOpening.name}
                </span>
            </div>
        `;
        return window.lastDetectedOpening;
    } else {
        if (!window.activePracticeOpening) {
            theoryBadge.classList.add('hidden');
        }
        return null;
    }
}


function getBookMovesAndOpenings(historyIndex) {
    if (!window.openingLibrary || window.openingLibrary.length === 0) {
        return {};
    }

    const targetIndex = (historyIndex !== undefined) ? Math.max(0, historyIndex) : window.currentHistoryIndex;
    const activeMoves = window.recordedMoves.slice(0, targetIndex);
    const currentMovesArr = activeMoves.map(m => m.toLowerCase().replace(/[+#x=]/g, ''));
    
    const bookMovesMap = {}; // nextMove -> list of { eco, name }
    
    window.openingLibrary.forEach(op => {
        const opMovesArr = op.normMoves.split(/\s+/).filter(m => m.length > 0);
        
        if (opMovesArr.length > currentMovesArr.length) {
            let matches = true;
            for (let i = 0; i < currentMovesArr.length; i++) {
                if (opMovesArr[i] !== currentMovesArr[i]) {
                    matches = false;
                    break;
                }
            }
            
            if (matches) {
                const parsedMoves = parseOpeningMoves(op.moves);
                const nextMoveSan = parsedMoves[currentMovesArr.length];
                if (nextMoveSan) {
                    if (!bookMovesMap[nextMoveSan]) {
                        bookMovesMap[nextMoveSan] = [];
                    }
                    if (!bookMovesMap[nextMoveSan].some(item => item.name === op.name)) {
                        bookMovesMap[nextMoveSan].push({ eco: op.eco, name: op.name });
                    }
                }
            }
        }
    });
    
    return bookMovesMap;
}