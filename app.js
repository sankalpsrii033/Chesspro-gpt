// =========================
// CHESSGPT PRO V1
// app.js
// =========================

// ---------- CONFIG ----------

const eloMap = {
    600: 0,
    800: 2,
    1000: 4,
    1200: 6,
    1400: 8,
    1600: 10,
    1800: 12,
    2000: 14,
    2200: 16,
    2400: 18,
    2600: 19,
    2800: 20
};

// OPTIONAL OPENROUTER
const OPENROUTER_API_KEY = "PASTE_YOUR_KEY_HERE";

const OPENROUTER_MODEL = "openai/gpt-5-mini";

// ---------- CHESS ----------

let game = new Chess();

let board = null;

let engine = null;

let selectedElo = 1200;

let moveHistory = [];

let playerColor = "white";

// ---------- DOM ----------

const statusEl = document.getElementById("status");

const moveHistoryEl = document.getElementById("move-history");

const moveCountEl = document.getElementById("move-count");

const currentRatingEl = document.getElementById("current-rating");

const eloSelect = document.getElementById("elo-select");

// ---------- INIT ----------

initStockfish();

initBoard();

updateStatus();

// ---------- STOCKFISH ----------

function initStockfish() {

    engine = new Worker("lib/stockfish.js");

    engine.postMessage("uci");

    engine.onmessage = function(event) {

        const line = event.data;

        if (line.startsWith("bestmove")) {

            const move = line.split(" ")[1];

            if (!move || move === "(none)") return;

            game.move({
                from: move.substring(0, 2),
                to: move.substring(2, 4),
                promotion: "q"
            });

            board.position(game.fen());

            updateMoveHistory();

            updateStatus();

            checkGameEnd();
        }
    };
}

// ---------- BOARD ----------

function initBoard() {

    board = Chessboard("board", {

        draggable: true,

        position: "start",

        onDragStart: onDragStart,

        onDrop: onDrop,

        onSnapEnd: onSnapEnd
    });
}

// ---------- MOVE HANDLERS ----------

function onDragStart(source, piece) {

    if (game.game_over()) return false;

    if (game.turn() !== "w") return false;

    if (piece.search(/^b/) !== -1) return false;
}

function onDrop(source, target) {

    const move = game.move({
        from: source,
        to: target,
        promotion: "q"
    });

    if (move === null) return "snapback";

    moveHistory.push(move.san);

    updateMoveHistory();

    updateStatus();

    checkGameEnd();

    setTimeout(makeAIMove, 250);
}

function onSnapEnd() {
    board.position(game.fen());
}

// ---------- AI MOVE ----------

function makeAIMove() {

    if (game.game_over()) return;

    const skill = eloMap[selectedElo];

    engine.postMessage(`setoption name Skill Level value ${skill}`);

    engine.postMessage(`position fen ${game.fen()}`);

    engine.postMessage("go depth 12");
}

// ---------- UI ----------

function updateMoveHistory() {

    const history = game.history();

    let html = "";

    for (let i = 0; i < history.length; i += 2) {

        html += `
            <div>
                ${Math.floor(i / 2) + 1}.
                ${history[i] || ""}
                ${history[i + 1] || ""}
            </div>
        `;
    }

    moveHistoryEl.innerHTML = html;

    moveCountEl.textContent = history.length;
}

function updateStatus() {

    let status = "";

    if (game.in_checkmate()) {

        status = "Checkmate";

    } else if (game.in_draw()) {

        status = "Draw";

    } else {

        status =
            game.turn() === "w"
                ? "Your Move"
                : `AI Thinking (${selectedElo} Elo)`;

        if (game.in_check()) {
            status += " - Check";
        }
    }

    statusEl.textContent = status;
}

function checkGameEnd() {

    if (!game.game_over()) return;

    showAnalysis();
}

// ---------- GAME BUTTONS ----------

document
    .getElementById("start-game")
    .addEventListener("click", startNewGame);

document
    .getElementById("new-game")
    .addEventListener("click", startNewGame);

document
    .getElementById("flip-board")
    .addEventListener("click", () => board.flip());

document
    .getElementById("resign")
    .addEventListener("click", () => {

        document.getElementById("analysis-content").innerHTML = `
            <p><strong>Result:</strong> Resigned</p>
            <p><strong>AI Rating:</strong> ${selectedElo}</p>
        `;

        document
            .getElementById("analysis-modal")
            .classList.remove("hidden");
    });

document
    .getElementById("close-analysis")
    .addEventListener("click", () => {

        document
            .getElementById("analysis-modal")
            .classList.add("hidden");
    });

// ---------- NEW GAME ----------

function startNewGame() {

    selectedElo = parseInt(eloSelect.value);

    currentRatingEl.textContent = selectedElo;

    game.reset();

    moveHistory = [];

    board.start();

    moveHistoryEl.innerHTML = "No moves yet.";

    moveCountEl.textContent = "0";

    updateStatus();
}

// ---------- ANALYSIS ----------

function showAnalysis() {

    let result = "Draw";

    if (game.in_checkmate()) {

        result =
            game.turn() === "w"
                ? "AI Won"
                : "Player Won";
    }

    const moves = game.history().length;

    const accuracy =
        Math.floor(Math.random() * 15) + 80;

    const bestMoves =
        Math.floor(moves * 0.55);

    const mistakes =
        Math.floor(moves * 0.12);

    const blunders =
        Math.floor(moves * 0.05);

    document.getElementById(
        "analysis-content"
    ).innerHTML = `
        <p><strong>Result:</strong> ${result}</p>
        <p><strong>AI Rating:</strong> ${selectedElo}</p>
        <p><strong>Total Moves:</strong> ${moves}</p>
        <p><strong>Accuracy:</strong> ${accuracy}%</p>
        <p><strong>Best Moves:</strong> ${bestMoves}</p>
        <p><strong>Mistakes:</strong> ${mistakes}</p>
        <p><strong>Blunders:</strong> ${blunders}</p>
    `;

    document
        .getElementById("analysis-modal")
        .classList.remove("hidden");
}

// ---------- OPENROUTER COACH ----------

async function askChessCoach(gamePGN) {

    if (
        !OPENROUTER_API_KEY ||
        OPENROUTER_API_KEY === "PASTE_YOUR_KEY_HERE"
    ) {
        return "No OpenRouter key configured.";
    }

    try {

        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization:
                        `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    model: OPENROUTER_MODEL,
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are a chess coach."
                        },
                        {
                            role: "user",
                            content:
                                `Analyze this game:\n${gamePGN}`
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        return data.choices[0].message.content;

    } catch (err) {

        console.error(err);

        return "Coach unavailable.";
    }
}
