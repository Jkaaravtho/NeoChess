/* © neochess */
'use strict';


window.game = null;
window.board = null;


window.startingFen = 'start';
window.recordedMoves = [];
window.fenHistory = ['start'];
window.currentHistoryIndex = 0;


window.autoplayInterval = null;
window.selectedSquare = null;


window.isBranchActive = false;
window.branchStartHistoryIndex = 0;
window.mainRecordedMovesSaved = [];
window.mainFenHistorySaved = [];
window.mainHistoryIndexSaved = 0;

// dictionaries
window.openingLibrary = [];
window.fenToOpeningMap = {};
window.movesToOpeningMap = {};
window.activePracticeOpening = null;
window.practiceMoveIndex = 0;
window.isReadingOpening = false;
window.wasEngineActiveBeforePractice = false;
window.lastDetectedOpening = null; // name


window.stockfish = null;
window.engineActive = false;
window.activeArrowCount = 1;
window.currentMultiPVData = {};


window.guiUpdatePending = false;
window.guiUpdateTimeout = null;
window.predictedBestMove = null;
window.lastCalculatedFen = '';
window.engineConnected = false;
window.engineIsMock = false;
window.handshakeTimeout = null;

window.engineIsSearching = false;
window.pendingSearchFen = null;
window.activeSearchTurn = 'w';
window.isFirstLineForCurrentPosition = false;

window.lastRenderedBadgeFen = '';
window.isReviewActive = false; // Game

window.evaluatedScores = {};
window.bestMoveCache = {};


window.aiSide = 'random';
window.resolvedAiColor = 'b';
window.aiDifficulty = 5;
window.isAiMatchActive = false;
window.aiIsThinking = false;


window.localPuzzlesPool = [];
window.playedPuzzleIds = new Set();
window.currentPuzzle = null;
window.puzzleActive = false;
window.puzzleMoveIndex = 0;
window.puzzleColor = 'w';
window.puzzleInitialFen = '';
window.puzzleEloFilter = 1500;
window.puzzleSource = 'local'; // or lichess
window.puzzleCurrentLineNode = null; 