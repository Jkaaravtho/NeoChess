/* hi lol */
'use strict';

function removeHighlights() {
    $('#my-board .square-55d63').removeClass('highlight-selected highlight-legal highlight-legal-capture');
}

function showLegalMoves(square) {
    const moves = window.game.moves({
        square: square,
        verbose: true
    });

    moves.forEach(move => {
        const targetSquareEl = $('#my-board .square-' + move.to);
        if (window.game.get(move.to)) {
            targetSquareEl.addClass('highlight-legal-capture');
        } else {
            targetSquareEl.addClass('highlight-legal');
        }
    });
}

function syncRulesEngineToHistoryIndex(index) {
    if (index < 0 || index >= window.fenHistory.length) return;

    window.currentHistoryIndex = index;

    if (window.startingFen === 'start') {
        window.game.reset();
    } else {
        window.game.load(window.startingFen);
    }

    for (let i = 0; i < index; i++) {
        window.game.move(window.recordedMoves[i]);
    }

    window.board.position(window.game.fen());
    highlightActiveMoveButton();

    clearAssessmentVisuals();
    window.lastRenderedBadgeFen = '';

    detectCurrentOpening();

    if (window.engineActive) {
        updateEnginePosition();
    } else {
        renderMoveAssessment();
    }

    if (typeof window.updateCoachExplanations === 'function') {
        window.updateCoachExplanations();
    }

    checkAndTriggerAiMove();
}

function onDragStart(source, piece, position, orientation) {
    if (window.game.game_over() || window.aiIsThinking) return false;
    
    if (window.puzzleActive) {
        if (window.currentHistoryIndex !== window.fenHistory.length - 1) return false;
        
        const playerColor = window.puzzleColor;
        if ((playerColor === 'w' && piece.search(/^b/) !== -1) ||
            (playerColor === 'b' && piece.search(/^w/) !== -1)) {
            return false;
        }
        
        clearAssessmentVisuals();
        removeHighlights();
        window.selectedSquare = source;
        $('#my-board .square-' + source).addClass('highlight-selected');
        showLegalMoves(source);
        return;
    }

    // Branch handling
    if (window.isBranchActive) {
        if (window.currentHistoryIndex !== window.fenHistory.length - 1) return false;
    }

    if (window.isAiMatchActive && window.game.turn() === window.resolvedAiColor) return false;

    if ((window.game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (window.game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }

    clearAssessmentVisuals();
    removeHighlights();
    window.selectedSquare = source;
    $('#my-board .square-' + source).addClass('highlight-selected');
    showLegalMoves(source);
}

function onDrop(source, target) {
    if (source === target) return;

    if (window.puzzleActive) {
        const isCorrect = validatePuzzleMove(source, target);
        if (!isCorrect) {
            applyAssessmentVisuals(target, 'incorrect');
            setPuzzleOutcome('Incorrect Move!', 'text-cyber-neonRed animate-pulse');
            return 'snapback';
        } else {
            applyAssessmentVisuals(target, 'correct');
            setPuzzleOutcome('Correct Move!', 'text-cyber-neonGreen');
            
            const move = window.game.move({
                from: source,
                to: target,
                promotion: 'q'
            });
            
            commitPlayedMove(move);
            advancePuzzleState(source + target + (move.promotion || ''));
            return;
        }
    }

    const testGame = new Chess(window.game.fen());
    const testMove = testGame.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (testMove === null) return 'snapback';

    if (window.activePracticeOpening) {
        const parsedMoves = parseOpeningMoves(window.activePracticeOpening.moves);
        const expectedMove = parsedMoves[window.practiceMoveIndex];
        if (expectedMove && !compareMoves(testMove.san, expectedMove) && !compareMoves(testMove.lan, expectedMove)) {
            applyAssessmentVisuals(target, 'incorrect');
            showTheoryModal(testMove.san);
            return 'snapback';
        } else {
            applyAssessmentVisuals(target, 'correct');
        }
    }

    const move = window.game.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (move === null) {
        removeHighlights();
        window.selectedSquare = null;
        return 'snapback';
    }

    commitPlayedMove(move);

    if (window.activePracticeOpening) {
        window.practiceMoveIndex++;
        if (window.practiceMoveIndex < parseOpeningMoves(window.activePracticeOpening.moves).length) {
            executePracticeOpponentMove();
        } else {
            checkPracticeCompletion();
        }
    }
}

function onSnapEnd() {
    window.board.position(window.game.fen());
    updateMoveHistory();
    
    if (!window.activePracticeOpening && !window.puzzleActive) {
        if (window.engineActive) {
            updateEnginePosition();
        } else {
            renderMoveAssessment();
        }
        checkAndTriggerAiMove();
    }
}

function commitPlayedMove(move) {
    removeHighlights();
    window.selectedSquare = null;

    // Capture branch
    if (!window.isBranchActive && window.currentHistoryIndex < window.fenHistory.length - 1) {
        window.isBranchActive = true;
        window.branchStartHistoryIndex = window.currentHistoryIndex;
        window.mainRecordedMovesSaved = [...window.recordedMoves];
        window.mainFenHistorySaved = [...window.fenHistory];
        window.mainHistoryIndexSaved = window.currentHistoryIndex;
    }

    window.recordedMoves = window.recordedMoves.slice(0, window.currentHistoryIndex);
    window.recordedMoves.push(move.san);

    window.fenHistory = window.fenHistory.slice(0, window.currentHistoryIndex + 1);
    window.fenHistory.push(window.game.fen());
    window.currentHistoryIndex = window.fenHistory.length - 1;

    if (!window.activePracticeOpening && !window.puzzleActive) {
        clearAssessmentVisuals();
    }
    window.lastRenderedBadgeFen = '';
}

function deleteBranch() {
    if (!window.isBranchActive) return;

    window.isBranchActive = false;
    window.recordedMoves = [...window.mainRecordedMovesSaved];
    window.fenHistory = [...window.mainFenHistorySaved];
    
    const targetIndex = window.branchStartHistoryIndex;
    
    window.mainRecordedMovesSaved = [];
    window.mainFenHistorySaved = [];
    
    syncRulesEngineToHistoryIndex(targetIndex);
}

function checkAndTriggerAiMove() {
    if (!window.isAiMatchActive || window.game.game_over() || window.aiIsThinking) return;

    if (window.game.turn() === window.resolvedAiColor) {
        triggerAiCalculation();
    }
}

function triggerAiCalculation() {
    window.aiIsThinking = true;
    const depthEl = document.getElementById('engine-depth');
    if (depthEl) depthEl.innerText = "AI is thinking...";

    if (window.engineIsMock || !window.stockfish) {
        executeMockAiMove();
        return;
    }

    if (window.engineActive) {
        window.stockfish.postMessage('stop');
    }

    setTimeout(() => {
        if (window.stockfish && !window.engineIsMock) {
            window.stockfish.postMessage(`position fen ${window.game.fen()}`);
            const targetDepth = Math.max(3, Math.min(20, Math.floor(window.aiDifficulty * 1.5)));
            window.stockfish.postMessage(`go depth ${targetDepth}`);
        }
    }, 150);
}

function executeMockAiMove() {
    setTimeout(() => {
        const moves = window.game.moves({ verbose: true });
        if (moves.length === 0) return;

        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        const playedMove = window.game.move({
            from: randomMove.from,
            to: randomMove.to,
            promotion: 'q'
        });

        if (playedMove) {
            commitPlayedMove(playedMove);
            window.board.position(window.game.fen());
            updateMoveHistory();
            window.aiIsThinking = false;

            const depthEl = document.getElementById('engine-depth');
            const npsEl = document.getElementById('engine-nps');
            if (depthEl) depthEl.innerText = "Theory Mode";
            if (npsEl) npsEl.innerText = "0 kN/s";
        }
    }, 800);
}

function handleAiBestMove(bestMoveStr) {
    window.aiIsThinking = false;

    const source = bestMoveStr.slice(0, 2);
    const target = bestMoveStr.slice(2, 4);
    const promotion = bestMoveStr.length > 4 ? bestMoveStr.charAt(4) : undefined;

    const move = window.game.move({
        from: source,
        to: target,
        promotion: promotion || 'q'
    });

    if (move) {
        commitPlayedMove(move);
        window.board.position(window.game.fen());
        updateMoveHistory();

        if (window.engineActive) {
            updateEnginePosition();
        }
    }
}

function handleSquareClick(square) {
    if (window.aiIsThinking) return;
    if (window.isAiMatchActive && window.game.turn() === window.resolvedAiColor) return;

    const piece = window.game.get(square);

    if (window.puzzleActive) {
        if (piece && piece.color !== window.puzzleColor) {
            return;
        }
    }

    if (window.isBranchActive) {
        if (window.currentHistoryIndex !== window.fenHistory.length - 1) return;
    }

    if (piece && piece.color === window.game.turn()) {
        if (window.selectedSquare === square) {
            window.selectedSquare = null;
            removeHighlights();
        } else {
            clearAssessmentVisuals();
            removeHighlights();
            window.selectedSquare = square;
            $('#my-board .square-' + square).addClass('highlight-selected');
            showLegalMoves(square);
        }
    } else if (window.selectedSquare) {
        const testGame = new Chess(window.game.fen());
        const testMove = testGame.move({
            from: window.selectedSquare,
            to: square,
            promotion: 'q'
        });

        if (testMove) {
            if (window.puzzleActive) {
                const isCorrect = validatePuzzleMove(window.selectedSquare, square);
                if (!isCorrect) {
                    applyAssessmentVisuals(square, 'incorrect');
                    setPuzzleOutcome('Incorrect Move!', 'text-cyber-neonRed animate-pulse');
                    window.selectedSquare = null;
                    removeHighlights();
                    return;
                } else {
                    applyAssessmentVisuals(square, 'correct');
                    setPuzzleOutcome('Correct Move!', 'text-cyber-neonGreen');
                    
                    const playedUci = window.selectedSquare + square + (testMove.promotion || '');
                    
                    const realMove = window.game.move({
                        from: window.selectedSquare,
                        to: square,
                        promotion: 'q'
                    });
                    
                    commitPlayedMove(realMove);
                    window.board.position(window.game.fen());
                    updateMoveHistory();
                    
                    advancePuzzleState(playedUci);
                    return;
                }
            }

            if (window.activePracticeOpening) {
                const parsedMoves = parseOpeningMoves(window.activePracticeOpening.moves);
                const expectedMove = parsedMoves[window.practiceMoveIndex];
                if (expectedMove && !compareMoves(testMove.san, expectedMove) && !compareMoves(testMove.lan, expectedMove)) {
                    applyAssessmentVisuals(square, 'incorrect');
                    showTheoryModal(testMove.san);
                    window.selectedSquare = null;
                    removeHighlights();
                    return;
                } else {
                    applyAssessmentVisuals(square, 'correct');
                }
            }

            const move = window.game.move({
                from: window.selectedSquare,
                to: square,
                promotion: 'q'
            });

            if (move) {
                commitPlayedMove(move);
                window.board.position(window.game.fen());
                updateMoveHistory();

                if (window.activePracticeOpening) {
                    window.practiceMoveIndex++;
                    if (window.practiceMoveIndex < parseOpeningMoves(window.activePracticeOpening.moves).length) {
                        executePracticeOpponentMove();
                    } else {
                        checkPracticeCompletion();
                    }
                } else {
                    if (window.engineActive) {
                        updateEnginePosition();
                    } else {
                        renderMoveAssessment();
                    }
                    checkAndTriggerAiMove();
                }
            }
        } else {
            window.selectedSquare = null;
            removeHighlights();
        }
    }
}

var lastEventTime = 0;
function handleCapturedInput(e) {
    const now = Date.now();
    if (now - lastEventTime < 100) return;
    lastEventTime = now;

    let target = e.target;
    while (target && target !== document.getElementById('my-board')) {
        if (target.classList && target.classList.contains('square-55d63')) {
            const square = target.getAttribute('data-square');
            if (square) {
                handleSquareClick(square);
            }
            break;
        }
        target = target.parentElement;
    }
}

function updateMoveHistory() {
    const moveHistoryContainer = document.getElementById('move-history');
    if (!moveHistoryContainer) return;

    if (!window.isBranchActive) {
        if (window.recordedMoves.length === 0) {
            moveHistoryContainer.innerHTML = `
                <div id="empty-history" class="text-xs text-slate-500 italic text-center py-8">
                    No moves played yet.
                </div>
            `;
        } else {
            let htmlContent = '';
            for (let i = 0; i < window.recordedMoves.length; i += 2) {
                const moveNumber = Math.floor(i / 2) + 1;
                const whiteSan = window.recordedMoves[i];
                const blackSan = window.recordedMoves[i + 1] || '';

                htmlContent += `
                    <div class="flex flex-col gap-1 border-b border-cyber-border/60 pb-2">
                        <div class="flex items-center text-xs">
                            <span class="w-8 text-slate-500 font-mono text-right pr-2">${moveNumber}.</span>
                            <button class="px-2 py-1 rounded bg-slate-800 text-slate-200 font-medium font-mono hover:bg-cyan-950 hover:text-cyber-accent transition-colors" data-index="${i}" data-line="main">
                                ${whiteSan}
                            </button>
                            ${blackSan ? `
                            <button class="ml-2 px-2 py-1 rounded bg-slate-800 text-slate-200 font-medium font-mono hover:bg-cyan-950 hover:text-cyber-accent transition-colors" data-index="${i + 1}" data-line="main">
                                ${blackSan}
                            </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }

            moveHistoryContainer.innerHTML = htmlContent;
        }
    } else {
        // -tree mapping
        let htmlContent = '';
        const maxMoves = Math.max(window.mainRecordedMovesSaved.length, window.recordedMoves.length);

        for (let i = 0; i < maxMoves; i += 2) {
            const moveNumber = Math.floor(i / 2) + 1;
            const mainWhiteSan = window.mainRecordedMovesSaved[i] || '';
            const mainBlackSan = window.mainRecordedMovesSaved[i + 1] || '';
            const branchWhiteSan = window.recordedMoves[i] || '';
            const branchBlackSan = window.recordedMoves[i + 1] || '';

            const isBranchExist = (i >= window.branchStartHistoryIndex);

            htmlContent += `
                <div class="flex flex-col gap-1 border-b border-cyber-border/60 pb-2">
                    <div class="flex items-center text-xs justify-between">
                        <div class="flex items-center">
                            <span class="w-8 text-slate-500 font-mono text-right pr-2">${moveNumber}.</span>
                            ${mainWhiteSan ? `
                            <button class="px-2 py-1 rounded bg-slate-800 text-slate-200 font-medium font-mono hover:bg-cyan-950 hover:text-cyber-accent transition-colors" data-index="${i}" data-line="main">
                                ${mainWhiteSan}
                            </button>
                            ` : ''}
                            ${mainBlackSan ? `
                            <button class="ml-2 px-2 py-1 rounded bg-slate-800 text-slate-200 font-medium font-mono hover:bg-cyan-950 hover:text-cyber-accent transition-colors" data-index="${i + 1}" data-line="main">
                                ${mainBlackSan}
                            </button>
                            ` : ''}
                        </div>
                        ${i === window.branchStartHistoryIndex ? `
                        <span class="text-[9px] font-mono text-slate-500 uppercase tracking-widest mr-2">Main Line</span>
                        ` : ''}
                    </div>
            `;

            if (isBranchExist && (branchWhiteSan || branchBlackSan)) {
                const isStartOfBranch = (i === window.branchStartHistoryIndex || (i === window.branchStartHistoryIndex + 1 && !branchWhiteSan));

                htmlContent += `
                    <div class="flex items-center text-xs pl-8 justify-between bg-slate-900/40 p-1 rounded border border-dashed border-slate-800/80 mt-1">
                        <div class="flex items-center">
                            ${isStartOfBranch ? `
                            <button id="delete-branch-btn" class="mr-2 text-rose-500 hover:text-rose-400 font-bold px-1.5 py-0.5 rounded hover:bg-rose-950/40 transition-colors animate-pulse" title="Delete variation branch">✕</button>
                            ` : ''}
                            ${branchWhiteSan ? `
                            <button class="px-2 py-1 rounded border border-slate-700 bg-slate-900/50 text-slate-400 font-medium font-mono hover:bg-cyan-950/20 hover:text-cyber-accent transition-colors" data-index="${i}" data-line="branch">
                                ${branchWhiteSan}
                            </button>
                            ` : ''}
                            ${branchBlackSan ? `
                            <button class="ml-2 px-2 py-1 rounded border border-slate-700 bg-slate-900/50 text-slate-400 font-medium font-mono hover:bg-cyan-950/20 hover:text-cyber-accent transition-colors" data-index="${i + 1}" data-line="branch">
                                ${branchBlackSan}
                            </button>
                            ` : ''}
                        </div>
                        <span class="text-[9px] font-mono text-slate-500 uppercase tracking-widest mr-2">Branch</span>
                    </div>
                `;
            }

            htmlContent += `</div>`;
        }

        moveHistoryContainer.innerHTML = htmlContent;

        const deleteBranchBtn = document.getElementById('delete-branch-btn');
        if (deleteBranchBtn) {
            deleteBranchBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteBranch();
            });
        }
    }

    highlightActiveMoveButton();
    detectCurrentOpening();
}

function highlightActiveMoveButton() {
    const buttons = document.querySelectorAll('#move-history button');
    const moveHistoryContainer = document.getElementById('move-history');
    
    buttons.forEach(btn => {
        if (btn.id === 'delete-branch-btn') return;
        const line = btn.getAttribute('data-line');
        if (line === 'branch') {
            btn.className = 'px-2 py-1 rounded border border-slate-700 bg-slate-900/50 text-slate-400 font-medium font-mono hover:bg-cyan-950/20 hover:text-cyber-accent transition-colors';
        } else {
            btn.className = 'px-2 py-1 rounded bg-slate-800 text-slate-200 font-medium font-mono hover:bg-cyan-950 hover:text-cyber-accent transition-colors';
        }
    });

    if (window.currentHistoryIndex > 0) {
        const activeLine = window.isBranchActive ? 'branch' : 'main';
        const activeBtn = document.querySelector(`#move-history button[data-index="${window.currentHistoryIndex - 1}"][data-line="${activeLine}"]`);
        if (activeBtn) {
            activeBtn.className = 'border border-cyber-accent text-cyber-accent bg-cyan-950/40 px-2 py-1 rounded font-medium font-mono transition-colors';
            
            if (moveHistoryContainer) {
                moveHistoryContainer.scrollTo({
                    top: activeBtn.offsetTop - moveHistoryContainer.offsetTop - (moveHistoryContainer.clientHeight / 2) + (activeBtn.clientHeight / 2),
                    behavior: 'smooth'
                });
            }
        }
    }
}

function toggleAutoplay() {
    const btnPlay = document.getElementById('nav-play');
    if (window.autoplayInterval) {
        clearInterval(window.autoplayInterval);
        window.autoplayInterval = null;
        if (btnPlay) btnPlay.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg> <span class="hidden sm:inline">Play</span>';
    } else {
        if (window.currentHistoryIndex >= window.fenHistory.length - 1) {
            syncRulesEngineToHistoryIndex(0);
        }
        if (btnPlay) btnPlay.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6"/></svg> <span class="hidden sm:inline">Pause</span>';
        
        window.autoplayInterval = setInterval(() => {
            if (window.currentHistoryIndex < window.fenHistory.length - 1) {
                syncRulesEngineToHistoryIndex(window.currentHistoryIndex + 1);
            } else {
                toggleAutoplay();
            }
        }, 1000);
    }
}

function clearAssessmentVisuals() {
    $('#my-board .square-55d63').find('.move-sign-badge, .move-sign-overlay').remove();
}

function applyAssessmentVisuals(square, type) {
    clearAssessmentVisuals();
    const squareEl = $('#my-board .square-' + square);
    if (squareEl.length === 0) return;

    let overlayColor = '';
    let imgName = '';

    switch (type) {
        case 'checkmate':
            overlayColor = 'rgba(100, 116, 139, 0.15)';
            imgName = 'checkmate.png';
            break;
        case 'winner':
            overlayColor = 'rgba(234, 179, 8, 0.15)';
            imgName = 'winner.png';
            break;
        case 'brilliant':
            overlayColor = 'rgba(13, 148, 136, 0.15)';
            imgName = 'brilliant.png';
            break;
        case 'best':
            overlayColor = 'rgba(59, 130, 246, 0.15)';
            imgName = 'best.png';
            break;
        case 'forced':
            overlayColor = 'rgba(148, 163, 184, 0.15)';
            imgName = 'best.png';
            break;
        case 'good':
            overlayColor = 'rgba(16, 185, 129, 0.15)';
            imgName = 'good.png';
            break;
        case 'correct':
            overlayColor = 'rgba(16, 185, 129, 0.2)';
            imgName = 'correct.png';
            break;
        case 'incorrect':
            overlayColor = 'rgba(239, 68, 68, 0.2)';
            imgName = 'incorrect.png';
            break;
        case 'inaccuracy':
            overlayColor = 'rgba(249, 115, 22, 0.15)';
            imgName = 'inaccuracy.png';
            break;
        case 'mistake':
            overlayColor = 'rgba(224, 86, 36, 0.15)';
            imgName = 'mistake.png';
            break;
        case 'blunder':
            overlayColor = 'rgba(239, 68, 68, 0.15)';
            imgName = 'blunder.png';
            break;
        case 'opening':
            overlayColor = 'rgba(6, 182, 212, 0.15)';
            imgName = 'opening.png';
            break;
    }

    if (!imgName) return;

    const overlayHtml = `<div class="move-sign-overlay" style="background-color: ${overlayColor};"></div>`;
    squareEl.prepend(overlayHtml);

    const badgeHtml = `
        <div class="move-sign-badge animate-fade-in">
            <img src="badges/${imgName}" class="w-full h-full object-contain drop-shadow" onerror="this.src='badges/${imgName}';" />
        </div>
    `;
    squareEl.append(badgeHtml);
}

function getLastMoveDetails() {
    if (window.currentHistoryIndex <= 0) return null;
    try {
        const tempGame = new Chess();
        if (window.startingFen === 'start') {
            tempGame.reset();
        } else {
            tempGame.load(window.startingFen);
        }
        for (let i = 0; i < window.currentHistoryIndex - 1; i++) {
            tempGame.move(window.recordedMoves[i]);
        }
        const moveObj = tempGame.move(window.recordedMoves[window.currentHistoryIndex - 1]);
        return moveObj;
    } catch (e) {
        console.warn("Failed to retrieve last move metadata.", e);
        return null;
    }
}

function renderMoveAssessment() {
    if (window.currentHistoryIndex <= 0) {
        clearAssessmentVisuals();
        return;
    }

    const lastMove = getLastMoveDetails();
    if (!lastMove) return;

    if (window.game.in_checkmate()) {
        applyAssessmentVisuals(lastMove.to, 'winner');
        return;
    }

    if (!window.puzzleActive && !window.activePracticeOpening) {
        const priorBookMoves = getBookMovesAndOpenings(window.currentHistoryIndex - 1);
        const playedSanClean = lastMove.san.replace(/[+#x=]/g, '');

        const isBookMove = Object.keys(priorBookMoves).some(bm => {
            return bm.replace(/[+#x=]/g, '') === playedSanClean;
        });

        if (isBookMove) {
            applyAssessmentVisuals(lastMove.to, 'opening');
            
            if (typeof window.updateCoachExplanations === 'function') {
                window.updateCoachExplanations();
            }
            return;
        }
    }

    const priorFen = window.fenHistory[window.currentHistoryIndex - 1];
    const currentFen = window.fenHistory[window.currentHistoryIndex];

    const priorScoreCp = window.evaluatedScores[priorFen];
    const currentScoreCp = window.evaluatedScores[currentFen];

    if (priorScoreCp === undefined || currentScoreCp === undefined) {
        if (typeof window.updateCoachExplanations === 'function') {
            window.updateCoachExplanations();
        }
        return;
    }

    const parts = priorFen.split(' ');
    const priorTurn = parts[1] || 'w';

    let cpl = priorScoreCp - currentScoreCp;
    if (priorTurn === 'b') {
        cpl = currentScoreCp - priorScoreCp;
    }

    if (cpl < 0) cpl = 0;

    const playedUci = lastMove.from + lastMove.to + (lastMove.promotion || '');
    const isBest = (playedUci === window.bestMoveCache[priorFen]);

    if (typeof ChessReview !== 'undefined') {
        const reviewResult = ChessReview.review({
            fenBefore: priorFen,
            fenAfter: currentFen,
            move: lastMove,
            cpLoss: cpl,
            isEngineBestMove: isBest,
            bestMoveSan: window.bestMoveCache[priorFen] || null,
            evalBeforeCp: priorScoreCp,
            evalAfterCp: currentScoreCp
        });
        applyAssessmentVisuals(lastMove.to, reviewResult.grade);
    } else {
        let assessmentType = 'good';
        if (isBest) {
            assessmentType = 'best';
        } else if (cpl <= 50) {
            assessmentType = 'good';
        } else if (cpl <= 120) {
            assessmentType = 'inaccuracy';
        } else if (cpl <= 200) {
            assessmentType = 'mistake';
        } else {
            assessmentType = 'blunder';
        }
        applyAssessmentVisuals(lastMove.to, assessmentType);
    }

    if (typeof window.updateCoachExplanations === 'function') {
        window.updateCoachExplanations();
    }
}

function showTheoryModal(playedSan) {
    const theoryModalBackdrop = document.getElementById('theory-modal-backdrop');
    const theoryModalText = document.getElementById('theory-modal-text');
    if (theoryModalBackdrop && theoryModalText && window.activePracticeOpening) {
        theoryModalText.innerHTML = `<span class="text-cyber-accent font-bold font-mono">${playedSan}</span> is not correct in standard <span class="text-slate-100 font-semibold">${window.activePracticeOpening.name}</span>.`;
        theoryModalBackdrop.classList.remove('hidden');
    }
}

function hideTheoryModal() {
    const theoryModalBackdrop = document.getElementById('theory-modal-backdrop');
    if (theoryModalBackdrop) {
        theoryModalBackdrop.classList.add('hidden');
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar && backdrop) {
        sidebar.classList.toggle('-translate-x-full');
        backdrop.classList.toggle('hidden');
    }
}

function selectSide(selection) {
    window.aiSide = selection;
    const sideWhiteBtn = document.getElementById('ai-side-white');
    const sideRandomBtn = document.getElementById('ai-side-random');
    const sideBlackBtn = document.getElementById('ai-side-black');

    [sideWhiteBtn, sideRandomBtn, sideBlackBtn].forEach(btn => {
        if (btn) {
            btn.className = 'py-1.5 px-2 bg-slate-800 hover:bg-slate-700 rounded font-semibold text-slate-400 border border-slate-700';
        }
    });
    
    if (selection === 'w' && sideWhiteBtn) {
        sideWhiteBtn.className = 'py-1.5 px-2 bg-slate-800 hover:bg-slate-700 rounded font-semibold text-cyber-accent border border-cyber-border';
    } else if (selection === 'random' && sideRandomBtn) {
        sideRandomBtn.className = 'py-1.5 px-2 bg-slate-800 hover:bg-slate-700 rounded font-semibold text-cyber-accent border border-cyber-border';
    } else if (selection === 'b' && sideBlackBtn) {
        sideBlackBtn.className = 'py-1.5 px-2 bg-slate-800 hover:bg-slate-700 rounded font-semibold text-cyber-accent border border-cyber-border';
    }
}

function toggleEngine() {
    if (window.puzzleActive) {
        alert("Stockfish analysis is disabled during Tactical Puzzles to prevent spoilers.");
        return;
    }

    if (window.engineIsMock) {
        triggerMockEngineFailover();
        return;
    }
    if (!window.stockfish) {
        initStockfish();
    }

    const statusDot = document.getElementById('engine-status-dot');
    const engineToggleText = document.getElementById('engine-toggle-text');
    const depthEl = document.getElementById('engine-depth');
    const statusLine = document.getElementById('engine-status-line');
    const toggleBtn = document.getElementById('engine-toggle-btn');

    if (window.engineActive) {
        window.engineActive = false;
        window.predictedBestMove = null;
        window.lastCalculatedFen = '';
        window.engineIsSearching = false;
        window.pendingSearchFen = null;
        if (window.stockfish) window.stockfish.postMessage('stop');

        const svg = document.getElementById('board-arrows');
        if (svg) $(svg).find('path.arrow-path').remove();

        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-slate-600';
        if (engineToggleText) engineToggleText.innerText = 'Stockfish';
        if (depthEl) depthEl.innerText = 'Paused';
        if (statusLine) statusLine.classList.add('hidden');
        
        if (toggleBtn) {
            toggleBtn.className = 'p-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-bold flex items-center gap-1.5 focus:outline-none';
        }
    } else {
        window.engineActive = true;
        window.lastCalculatedFen = '';

        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
        if (engineToggleText) engineToggleText.innerText = 'Stockfish';
        if (depthEl) depthEl.innerText = 'Starting...';
        if (statusLine) statusLine.classList.remove('hidden');

        if (toggleBtn) {
            toggleBtn.className = 'p-2.5 rounded bg-cyan-950/40 border border-cyber-accent text-cyber-accent hover:bg-cyan-900/20 transition-all text-xs font-bold flex items-center gap-1.5 focus:outline-none';
        }

        updateEnginePosition();
    }
}


window.onDragStart = onDragStart;
window.onDrop = onDrop;
window.onSnapEnd = onSnapEnd;
window.removeHighlights = removeHighlights;
window.showLegalMoves = showLegalMoves;
window.syncRulesEngineToHistoryIndex = syncRulesEngineToHistoryIndex;
window.commitPlayedMove = commitPlayedMove;
window.deleteBranch = deleteBranch;
window.checkAndTriggerAiMove = checkAndTriggerAiMove;
window.triggerAiCalculation = triggerAiCalculation;
window.executeMockAiMove = executeMockAiMove;
window.handleAiBestMove = handleAiBestMove;
window.handleSquareClick = handleSquareClick;
window.handleCapturedInput = handleCapturedInput;
window.updateMoveHistory = updateMoveHistory;
window.highlightActiveMoveButton = highlightActiveMoveButton;
window.toggleAutoplay = toggleAutoplay;
window.clearAssessmentVisuals = clearAssessmentVisuals;
window.applyAssessmentVisuals = applyAssessmentVisuals;
window.getLastMoveDetails = getLastMoveDetails;
window.renderMoveAssessment = renderMoveAssessment;
window.showTheoryModal = showTheoryModal;
window.hideTheoryModal = hideTheoryModal;
window.toggleSidebar = toggleSidebar;
window.selectSide = selectSide;
window.toggleEngine = toggleEngine;