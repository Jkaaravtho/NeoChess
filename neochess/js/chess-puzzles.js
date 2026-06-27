// hey bro why
'use strict';


function getEloColor(rating) {
    const min = 1000;
    const max = 2700;
    const p = Math.max(0, Math.min(1, (rating - min) / (max - min)));
    let r, g, b;
    if (p < 0.5) {
        
        const factor = p * 2;
        r = Math.round(16 + (249 - 16) * factor);
        g = Math.round(185 + (115 - 185) * factor);
        b = Math.round(129 + (22 - 129) * factor);
    } else {
        
        const factor = (p - 0.5) * 2;
        r = Math.round(249 + (239 - 249) * factor);
        g = Math.round(115 + (68 - 115) * factor);
        b = Math.round(22 + (68 - 22) * factor);
    }
    return `rgb(${r}, ${g}, ${b})`;
}

function updateSliderColoring(value) {
    const color = getEloColor(value);
    const display = document.getElementById('puzzle-elo-display');
    const slider = document.getElementById('puzzle-elo-slider');
    if (display) {
        display.innerText = `${value} ELO`;
        display.style.color = color;
    }
    if (slider) {
        slider.style.accentColor = color;
        const min = slider.min ? parseInt(slider.min) : 1000;
        const max = slider.max ? parseInt(slider.max) : 2700;
        const percent = ((value - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to right, ${color} 0%, ${color} ${percent}%, #1e293b ${percent}%, #1e293b 100%)`;
    }
}

// Difficulty 
function adjustPuzzleElo(amount) {
    window.puzzleEloFilter = Math.max(1000, Math.min(2700, window.puzzleEloFilter + amount));
    updateSliderColoring(window.puzzleEloFilter);
    loadNewPuzzle();
}


async function loadLocalPuzzles() {
    try {
        const response = await fetch('Puzzles/puzzles.json');
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        window.localPuzzlesPool = Array.isArray(data) ? data : [];
        console.log(`Successfully loaded ${window.localPuzzlesPool.length} local puzzles from database.`);
    } catch (err) {
        console.warn("Could not find or fetch Puzzles/puzzles.json locally. Initializing embedded fallback database.", err);
        
        // Standalone
        window.localPuzzlesPool = [
            {
                "id": 61650,
                "rating": 1001,
                "color": "w",
                "fen": "6R1/p4p2/8/6k1/5b2/1PN1n3/PP1r4/KB6 b - - 7 44",
                "initialMove": { "san": "Kf6", "uci": "g5f6" },
                "lines": {
                    "c3e4": {
                        "f6e7": {
                            "e4d2": {
                                "e3d5": "win"
                            }
                        }
                    }
                }
            },
            {
                "id": 63099,
                "rating": 2681,
                "color": "b",
                "fen": "5rk1/q2r1p1p/2R2Rp1/pp1B2P1/8/5Q1P/Pb3PK1/8 w - - 0 30",
                "initialMove": { "san": "Ra6", "uci": "c6a6" },
                "lines": {
                    "a7c5": {
                        "f6g6": {
                            "g8h8": {
                                "g6c6": {
                                    "c5d5": {
                                        "f3d5": {
                                            "d7d5": {
                                                "a6a5": "win"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ];
        console.log(`Successfully loaded ${window.localPuzzlesPool.length} local puzzles from fallback database.`);
    }
}

// Initialize solve
try {
    const savedStats = localStorage.getItem('neoChessSolvedPuzzles');
    if (savedStats) {
        window.playedPuzzleIds = new Set(JSON.parse(savedStats));
    }
} catch (e) {
    console.warn("Storage profile blocked.", e);
}


function togglePuzzleHub() {
    const hud = document.getElementById('puzzles-hud');
    const badge = document.getElementById('puzzles-toggle-btn');
    const badgeActive = document.getElementById('puzzle-active-badge');
    const playbackControls = document.getElementById('playback-controls');
    const puzzleBottomControls = document.getElementById('puzzle-bottom-controls');
    const evalBar = document.getElementById('eval-bar-container');

    if (window.puzzleActive) {
        window.puzzleActive = false;
        window.currentPuzzle = null;
        if (hud) hud.classList.add('hidden');
        if (badge) {
            badge.innerText = "Activate Puzzle Hub";
            badge.className = 'w-full bg-slate-800 hover:bg-cyan-950 hover:text-cyber-accent border border-slate-700 hover:border-cyan-800/50 text-slate-300 text-xs font-medium py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5';
        }
        if (badgeActive) badgeActive.classList.add('hidden');
        if (playbackControls) playbackControls.classList.remove('hidden');
        if (puzzleBottomControls) puzzleBottomControls.classList.add('hidden');
        if (evalBar) evalBar.classList.remove('hidden');
        
        
        window.startingFen = 'start';
        window.recordedMoves = [];
        window.fenHistory = ['start'];
        window.currentHistoryIndex = 0;
        window.lastDetectedOpening = null;
        window.game.reset();
        window.board.position('start');
        updateMoveHistory();
        clearAssessmentVisuals();
        window.lastRenderedBadgeFen = '';
    } else {
        
        if (window.engineActive) {
            toggleEngine();
        }

        window.puzzleActive = true;
        window.isAiMatchActive = false;
        window.aiIsThinking = false;
        window.activePracticeOpening = null;
        window.lastDetectedOpening = null;

        if (hud) hud.classList.remove('hidden');
        if (badge) {
            badge.innerText = "Deactivate Puzzle Hub";
            badge.className = 'w-full bg-rose-950/40 text-cyber-neonRed border border-rose-800/50 text-xs font-bold py-2.5 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 animate-pulse';
        }
        if (playbackControls) playbackControls.classList.add('hidden');
        if (puzzleBottomControls) puzzleBottomControls.classList.remove('hidden');
        if (evalBar) evalBar.classList.add('hidden');

        loadNewPuzzle();
    }
}

async function loadNewPuzzle() {
    clearAssessmentVisuals();
    window.lastRenderedBadgeFen = '';
    setPuzzleOutcome('Loading...', 'text-slate-500');

    
    const svg = document.getElementById('board-arrows');
    if (svg) $(svg).find('path.arrow-path').remove();

    
    window.puzzleSolutionShown = false;
    const studyNextBtn = document.getElementById('puzzle-study-next-btn');
    if (studyNextBtn) studyNextBtn.classList.add('hidden');
    
    const hintBtn = document.getElementById('puzzle-hint-btn');
    const solBtn = document.getElementById('puzzle-solution-btn');
    if (hintBtn) hintBtn.disabled = false;
    if (solBtn) solBtn.disabled = false;

    
    if (window.localPuzzlesPool && window.localPuzzlesPool.length > 0) {
        const chosen = getNextPuzzleForElo();
        if (chosen) {
            window.puzzleSource = 'local';
            const indicator = document.getElementById('puzzle-source-indicator');
            if (indicator) {
                indicator.innerText = "LOCAL DATABASE";
                indicator.className = "text-emerald-400 font-bold uppercase";
            }
            setupPuzzle(chosen);
            return;
        }
    }

    
    window.puzzleSource = 'lichess';
    const indicator = document.getElementById('puzzle-source-indicator');
    if (indicator) {
        indicator.innerText = "LICHESS API (LIVE)";
        indicator.className = "text-cyan-400 font-bold uppercase";
    }

    try {
        const response = await fetch('https://lichess.org/api/puzzle/next');
        if (!response.ok) throw new Error("Network offline");
        const data = await response.json();
        
        const standardLichessPuzzle = {
            id: data.puzzle.id,
            rating: data.puzzle.rating,
            fen: data.puzzle.fen,
            moves: data.puzzle.moves, 
            color: data.puzzle.color
        };
        
        setupPuzzle(standardLichessPuzzle);
    } catch (err) {
        console.warn("Lichess API fetch failed. Recycling local database pool.", err);
        window.playedPuzzleIds.clear();
        const closest = window.localPuzzlesPool[0];
        if (closest) setupPuzzle(closest);
    }
}

function setupPuzzle(puzzle) {
    window.currentPuzzle = puzzle;
    
    window.startingFen = puzzle.fen;
    window.recordedMoves = [];
    window.fenHistory = [puzzle.fen];
    window.currentHistoryIndex = 0;
    
    window.game.load(puzzle.fen);
    window.board.position(puzzle.fen);

    let firstOpponentMove = null;
    
    if (puzzle.lines) {
        window.puzzleCurrentLineNode = puzzle.lines;
        const initialUci = puzzle.initialMove.uci;
        
        try {
            firstOpponentMove = window.game.move(initialUci, { sloppy: true });
        } catch (e) {
            try {
                firstOpponentMove = window.game.move(puzzle.initialMove.san);
            } catch (e2) {
                console.error("Initial move error:", e2);
            }
        }
    } else if (puzzle.moves) {
        window.puzzleMoveIndex = 0;
        const initialUci = puzzle.moves[0];
        
        firstOpponentMove = window.game.move({
            from: initialUci.slice(0, 2),
            to: initialUci.slice(2, 4),
            promotion: initialUci.length > 4 ? initialUci.charAt(4) : undefined
        });
    }

    if (firstOpponentMove) {
        window.recordedMoves.push(firstOpponentMove.san);
        window.fenHistory.push(window.game.fen());
        window.currentHistoryIndex = 1;
        window.board.position(window.game.fen());
        updateMoveHistory();

        removeHighlights();
        $(`#my-board .square-${firstOpponentMove.from}`).addClass('highlight-selected');
        $(`#my-board .square-${firstOpponentMove.to}`).addClass('highlight-selected');
    }

    window.puzzleColor = window.game.turn();

    const badgeActive = document.getElementById('puzzle-active-badge');
    const statusText = document.getElementById('puzzle-status-display');
    
    if (badgeActive) {
        badgeActive.classList.remove('hidden', 'bg-cyan-950/30', 'border-cyan-800/40', 'text-cyber-accent');
        badgeActive.classList.add('bg-emerald-950/30', 'border-emerald-800/40', 'text-cyber-neonGreen');
    }
    if (statusText) {
        statusText.innerText = `Tactical Puzzle #${puzzle.id} [${puzzle.rating} ELO]`;
    }

    setPuzzleOutcome('Your Turn', 'text-cyber-neonGreen');
}

function setPuzzleOutcome(text, textClass) {
    const outcomeEl = document.getElementById('puzzle-outcome-display');
    if (outcomeEl) {
        outcomeEl.innerText = text;
        outcomeEl.className = `font-bold text-xs uppercase px-2 py-0.5 rounded bg-slate-900 border border-slate-800 transition-colors ${textClass}`;
    }
}

function restartPuzzle() {
    if (window.puzzleActive && window.currentPuzzle) {
        setupPuzzle(window.currentPuzzle);
    }
}

function skipPuzzle() {
    if (window.puzzleActive) {
        loadNewPuzzle();
    }
}


function validatePuzzleMove(source, target) {
    if (!window.puzzleActive || !window.currentPuzzle) return false;

    const testGame = new Chess(window.game.fen());
    const move = testGame.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (!move) return false;

    const playedUci = move.from + move.to + (move.promotion || '');

    if (window.currentPuzzle.lines) {
        if (window.puzzleCurrentLineNode && window.puzzleCurrentLineNode[playedUci]) {
            return true;
        }
    } else if (window.currentPuzzle.moves) {
        const expectedUci = window.currentPuzzle.moves[window.puzzleMoveIndex + 1];
        if (playedUci === expectedUci) {
            return true;
        }
    }
    return false;
}

function advancePuzzleState(playedUci) {
    if (!window.puzzleActive || !window.currentPuzzle) return;

    if (window.currentPuzzle.lines) {
        
        if (!window.puzzleCurrentLineNode || typeof window.puzzleCurrentLineNode !== 'object') {
            setPuzzleSolved();
            return;
        }

        const nextNode = window.puzzleCurrentLineNode[playedUci];
        if (!nextNode) return; // ignore invalid steps
        
        window.puzzleCurrentLineNode = nextNode;

        if (window.puzzleCurrentLineNode === "win" || Object.keys(window.puzzleCurrentLineNode).length === 0) {
            setPuzzleSolved();
            return;
        }

        const opponentReplyUci = Object.keys(window.puzzleCurrentLineNode)[0];
        setPuzzleOutcome('Opponent Turn...', 'text-slate-400');

        setTimeout(() => {
            const opMove = window.game.move({
                from: opponentReplyUci.slice(0, 2),
                to: opponentReplyUci.slice(2, 4),
                promotion: opponentReplyUci.length > 4 ? opponentReplyUci.charAt(4) : undefined
            });

            if (opMove) {
                window.recordedMoves.push(opMove.san);
                window.fenHistory.push(window.game.fen());
                window.currentHistoryIndex = window.fenHistory.length - 1;
                window.board.position(window.game.fen());
                updateMoveHistory();

                removeHighlights();
                $(`#my-board .square-${opMove.from}`).addClass('highlight-selected');
                $(`#my-board .square-${opMove.to}`).addClass('highlight-selected');

                window.puzzleCurrentLineNode = window.puzzleCurrentLineNode[opponentReplyUci];

                if (window.puzzleCurrentLineNode === "win" || Object.keys(window.puzzleCurrentLineNode).length === 0) {
                    setPuzzleSolved();
                } else {
                    setPuzzleOutcome('Your Turn', 'text-cyber-neonGreen');
                }
            }
        }, 600);

    } else if (window.currentPuzzle.moves) {
        window.puzzleMoveIndex++; 

        if (window.puzzleMoveIndex + 1 === window.currentPuzzle.moves.length) {
            setPuzzleSolved();
            return;
        }

        window.puzzleMoveIndex++; 
        const opponentReplyUci = window.currentPuzzle.moves[window.puzzleMoveIndex];
        setPuzzleOutcome('Opponent Turn...', 'text-slate-400');

        setTimeout(() => {
            const opMove = window.game.move({
                from: opponentReplyUci.slice(0, 2),
                to: opponentReplyUci.slice(2, 4),
                promotion: opponentReplyUci.length > 4 ? opponentReplyUci.charAt(4) : undefined
            });

            if (opMove) {
                window.recordedMoves.push(opMove.san);
                window.fenHistory.push(window.game.fen());
                window.currentHistoryIndex = window.fenHistory.length - 1;
                window.board.position(window.game.fen());
                updateMoveHistory();

                removeHighlights();
                $(`#my-board .square-${opMove.from}`).addClass('highlight-selected');
                $(`#my-board .square-${opMove.to}`).addClass('highlight-selected');

                if (window.puzzleMoveIndex + 1 === window.currentPuzzle.moves.length) {
                    setPuzzleSolved();
                } else {
                    setPuzzleOutcome('Your Turn', 'text-cyber-neonGreen');
                }
            }
        }, 600);
    }
}

function setPuzzleSolved() {
    setPuzzleOutcome('SOLVED!', 'text-cyber-accent font-bold animate-bounce');
    
    const badge = document.getElementById('puzzle-active-badge');
    if (badge) {
        badge.classList.remove('bg-emerald-950/30', 'border-emerald-800/40', 'text-cyber-neonGreen');
        badge.classList.add('bg-cyan-950/30', 'border-cyan-800/40', 'text-cyber-accent');
    }

    if (window.currentPuzzle && window.currentPuzzle.id) {
        window.playedPuzzleIds.add(window.currentPuzzle.id);
        try {
            localStorage.setItem('neoChessSolvedPuzzles', JSON.stringify(Array.from(window.playedPuzzleIds)));
        } catch (e) {}
    }

    const lastMove = getLastMoveDetails();
    if (lastMove) {
        applyAssessmentVisuals(lastMove.to, 'winner');
    }

     
    if (window.puzzleSolutionShown) {
        setPuzzleOutcome('STUDY REVIEW ACTIVE', 'text-cyan-400');
        const studyNextBtn = document.getElementById('puzzle-study-next-btn');
        if (studyNextBtn) studyNextBtn.classList.remove('hidden');
        return;
    }

    //  auto-load
    setTimeout(() => {
        loadNewPuzzle();
    }, 1500);
}


function showPuzzleHint() {
    if (!window.puzzleActive || !window.currentPuzzle) return;
    
    let nextUci = null;
    if (window.currentPuzzle.lines) {
        if (window.puzzleCurrentLineNode) {
            nextUci = Object.keys(window.puzzleCurrentLineNode)[0];
        }
    } else if (window.currentPuzzle.moves) {
        nextUci = window.currentPuzzle.moves[window.puzzleMoveIndex + 1];
    }

    if (nextUci) {
        const startSquare = nextUci.slice(0, 2);
        removeHighlights();
        $(`#my-board .square-${startSquare}`).addClass('highlight-selected');
    }
}

async function playPuzzleSolution() {
    if (!window.puzzleActive || !window.currentPuzzle) return;

    window.puzzleSolutionShown = true;
    setPuzzleOutcome('RUNNING SOLUTION', 'text-rose-500 animate-pulse');

    const hintBtn = document.getElementById('puzzle-hint-btn');
    const solBtn = document.getElementById('puzzle-solution-btn');
    if (hintBtn) hintBtn.disabled = true;
    if (solBtn) solBtn.disabled = true;

    if (window.currentPuzzle.lines) {
        let currentNode = window.puzzleCurrentLineNode;
        while (currentNode && currentNode !== "win" && typeof currentNode === 'object' && Object.keys(currentNode).length > 0) {
            const playerMoveUci = Object.keys(currentNode)[0];
            await playUciMoveWithDelay(playerMoveUci, 800);
            currentNode = currentNode[playerMoveUci];

            if (currentNode && currentNode !== "win" && typeof currentNode === 'object' && Object.keys(currentNode).length > 0) {
                const opponentMoveUci = Object.keys(currentNode)[0];
                await playUciMoveWithDelay(opponentMoveUci, 800);
                currentNode = currentNode[opponentMoveUci];
            }
        }
    } else if (window.currentPuzzle.moves) {
        while (window.puzzleMoveIndex + 1 < window.currentPuzzle.moves.length) {
            window.puzzleMoveIndex++;
            const moveUci = window.currentPuzzle.moves[window.puzzleMoveIndex];
            await playUciMoveWithDelay(moveUci, 800);
        }
    }

    setPuzzleOutcome('STUDY REVIEW ACTIVE', 'text-cyan-400');
    const studyNextBtn = document.getElementById('puzzle-study-next-btn');
    if (studyNextBtn) studyNextBtn.classList.remove('hidden');
}

function playUciMoveWithDelay(uci, delay) {
    return new Promise(resolve => {
        setTimeout(() => {
            const move = window.game.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                promotion: uci.length > 4 ? uci.charAt(4) : undefined
            });
            if (move) {
                window.recordedMoves.push(move.san);
                window.fenHistory.push(window.game.fen());
                window.currentHistoryIndex = window.fenHistory.length - 1;
                window.board.position(window.game.fen());
                updateMoveHistory();

                removeHighlights();
                $(`#my-board .square-${move.from}`).addClass('highlight-selected');
                $(`#my-board .square-${move.to}`).addClass('highlight-selected');
            }
            resolve();
        }, delay);
    });
}

function getNextPuzzleForElo() {
    let targetElo = window.puzzleEloFilter;
    
    
    if (targetElo >= 2000) {
        targetElo = 2000;
    }

    
    const minElo = targetElo - 30;
    const maxElo = targetElo + 50;

    const unplayed = window.localPuzzlesPool.filter(p => !window.playedPuzzleIds.has(p.id));
    const pool = unplayed.length > 0 ? unplayed : window.localPuzzlesPool;

   
    let candidates = pool.filter(p => p.rating >= minElo && p.rating <= maxElo);

    // Fallback 
    if (candidates.length === 0) {
        candidates = pool.filter(p => p.rating >= minElo);
    }
    if (candidates.length === 0) {
        candidates = pool;
    }

    
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const chosen = candidates[randomIndex];

    if (chosen) {
        if (chosen.rating < 2000) {
            window.puzzleEloFilter = chosen.rating + 1;
        } else {
            window.puzzleEloFilter = 2000;
        }
        
        // Sync UI element values
        const slider = document.getElementById('puzzle-elo-slider');
        if (slider) {
            slider.value = Math.min(2700, Math.max(1000, chosen.rating));
            updateSliderColoring(slider.value);
        }
    }
    return chosen;
}